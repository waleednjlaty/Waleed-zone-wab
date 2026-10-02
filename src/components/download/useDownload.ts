'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { deadline, downloadApi, DownloadApiError, secondsLeft, UUID } from './api';
import type { DownloadFile, DownloadRequest, DownloadState, DownloadToken } from './types';

const messages: Record<string, string> = {
  NETWORK_ERROR: 'تعذر الاتصال. تحقق من الإنترنت ثم أعد المحاولة؛ سنحاول استعادة الطلب نفسه.',
  DOWNLOAD_COOLDOWN: 'يرجى الانتظار قبل طلب تحميل آخر.',
  RATE_LIMITED: 'وصلت إلى حد المحاولات مؤقتًا. يمكنك إعادة المحاولة بعد انتهاء الوقت أدناه.',
  DIRECT_DOWNLOAD_UNAVAILABLE: 'التحميل المباشر متوقف مؤقتًا. حاول لاحقًا.',
  VERIFICATION_UNAVAILABLE: 'تعذر التحقق من الطلب الآن. حاول مجددًا بعد قليل.',
  STORAGE_UNAVAILABLE: 'خدمة الملفات غير متاحة مؤقتًا. حاول مجددًا بعد قليل.',
  FILE_UNAVAILABLE: 'هذا الملف غير متاح للتحميل حاليًا. ارجع إلى صفحة التطبيق.',
  REQUEST_REVOKED: 'لم يعد هذا الطلب متاحًا. ارجع إلى صفحة التطبيق للتحقق من الملف.',
  DOWNLOAD_IN_PROGRESS: 'لديك طلب تحميل آخر قيد التجهيز. أكمله في تبويبه أو انتظر انتهاء صلاحيته.',
  CSRF_REJECTED: 'تغيرت جلسة التحميل. أعد المحاولة لتحديثها.',
  DOWNLOAD_SESSION_REQUIRED: 'انتهت جلسة التحميل. أعد المحاولة، وتأكد من السماح بملفات الارتباط لهذا الموقع.',
  TOKEN_ISSUANCE_EXHAUSTED: 'تعذر تجديد هذا الرابط مرة أخرى. جهّز طلبًا جديدًا.',
  TOKEN_USED: 'استُخدم هذا الرابط بالفعل. راجع تنزيلات المتصفح أو جهّز طلبًا جديدًا.',
};

/** Only the public request ID and idempotency key can survive reload; no secrets. */
function readSaved(key: string): { requestId?: string; idempotencyKey?: string } {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || '{}');
    return { requestId: UUID.test(value.requestId || '') ? value.requestId : undefined,
      idempotencyKey: UUID.test(value.idempotencyKey || '') ? value.idempotencyKey : undefined };
  } catch { return {}; }
}

export function useDownload(file: DownloadFile | null) {
  const [state, setState] = useState<DownloadState>('INITIAL');
  const [remaining, setRemaining] = useState(0);
  const [message, setMessage] = useState('');
  const [token, setToken] = useState<DownloadToken | null>(null);
  const [csrf, setCsrf] = useState('');
  const [requestId, setRequestId] = useState('');
  const refs = useRef({ alive: true, busy: false, submitted: false, csrf: '', request: null as DownloadRequest | null,
    key: '', readyAt: 0, expiresAt: 0, tokenAt: 0, retryAt: 0 });
  const storageKey = file ? `wz-download:${file.application_id}:${file.version_id}:${file.file_id}` : '';

  const save = useCallback(() => {
    if (!storageKey) return;
    try { sessionStorage.setItem(storageKey, JSON.stringify({ requestId: refs.current.request?.request_id, idempotencyKey: refs.current.key })); } catch { /* In-memory flow works when storage is blocked. */ }
  }, [storageKey]);

  const accept = useCallback((request: DownloadRequest) => {
    const r = refs.current;
    r.request = request;
    r.readyAt = deadline(request.ready_at, request.server_time);
    r.expiresAt = deadline(request.request_expires_at, request.server_time);
    setRequestId(request.request_id);
    save();
    if (request.state === 'redeemed') { setState('SUCCESS'); return; }
    if (request.state === 'expired' || r.expiresAt <= performance.now()) { setState('EXPIRED'); return; }
    if (request.state === 'revoked') { setMessage(messages.REQUEST_REVOKED); setState('FAILED'); return; }
    // Countdown ending never grants access by itself; token() must authorize it.
    setRemaining(secondsLeft(r.readyAt));
    setState('COUNTDOWN');
  }, [save]);

  const fail = useCallback((error: unknown) => {
    const e = error instanceof DownloadApiError ? error : new DownloadApiError(0, 'NETWORK_ERROR');
    const r = refs.current;
    setToken(null);
    setMessage(messages[e.code] || 'تعذر تجهيز التحميل. أعد المحاولة أو ارجع إلى صفحة التطبيق.');
    if (e.code === 'CSRF_REJECTED' || e.status === 401) { r.csrf = ''; setCsrf(''); }
    if (e.status === 429 || (e.status === 503 && e.waitSeconds > 0)) {
      r.retryAt = performance.now() + e.waitSeconds * 1000;
      setRemaining(e.waitSeconds);
      setState(e.status === 429 ? 'RATE_LIMITED' : 'FAILED');
    } else if (e.status === 425) {
      r.readyAt = performance.now() + Math.max(1, e.waitSeconds) * 1000;
      setRemaining(secondsLeft(r.readyAt));
      setState('COUNTDOWN');
    } else if (['REQUEST_EXPIRED', 'TOKEN_EXPIRED', 'TOKEN_USED', 'TOKEN_ISSUANCE_EXHAUSTED'].includes(e.code)) {
      // A token may be renewed on the same unexpired request; consumed/exhausted
      // requests need a fresh key and another server countdown.
      if (e.code !== 'TOKEN_EXPIRED') r.request = null;
      setState('EXPIRED');
    } else {
      if (e.code === 'REQUEST_NOT_FOUND' || e.status === 401 || e.code === 'REQUEST_REVOKED') r.request = null;
      setState('FAILED');
    }
  }, []);

  const session = useCallback(async () => {
    if (!refs.current.csrf) {
      const value = await downloadApi.session();
      if (!refs.current.alive) return '';
      refs.current.csrf = value;
      setCsrf(value);
    }
    return refs.current.csrf;
  }, []);

  const issue = useCallback(async () => {
    const r = refs.current;
    if (r.busy || !r.request || !r.alive) return;
    r.busy = true;
    setState('LOADING');
    try {
      const secret = await session();
      if (!r.alive || !secret) return;
      const result = await downloadApi.token(r.request.request_id, secret);
      if (!r.alive) return;
      r.tokenAt = Math.min(deadline(result.token_expires_at, result.server_time), r.expiresAt);
      r.submitted = false;
      setToken(result);
      setRemaining(secondsLeft(r.tokenAt));
      setState('READY');
    } catch (error) { if (r.alive) fail(error); }
    finally { r.busy = false; }
  }, [fail, session]);

  const prepare = useCallback(async () => {
    const r = refs.current;
    if (!file || r.busy || secondsLeft(r.retryAt) > 0) return;
    r.busy = true;
    setState('LOADING'); setToken(null); setMessage('');
    try {
      if (r.request && r.expiresAt > performance.now() && !['redeemed', 'revoked', 'expired'].includes(r.request.state)) {
        const status = await downloadApi.status(r.request.request_id);
        if (r.alive) accept(status);
      } else {
        // A failed admission preserves the key. A terminal/expired request does not.
        if (r.request || !r.key || state === 'EXPIRED' || state === 'SUCCESS') {
          r.key = crypto.randomUUID(); r.request = null;
        }
        save();
        const secret = await session();
        if (!r.alive || !secret) return;
        const result = await downloadApi.request(file, secret, r.key);
        if (r.alive) accept(result);
      }
    } catch (error) { if (r.alive) fail(error); }
    finally { r.busy = false; }
  }, [accept, fail, file, save, session, state]);

  const check = useCallback(async () => {
    const r = refs.current;
    if (r.busy || !r.request) return;
    r.busy = true;
    try {
      const result = await downloadApi.status(r.request.request_id);
      if (!r.alive) return;
      if (result.state === 'redeemed' || result.state === 'expired' || result.state === 'revoked') accept(result);
      else {
        // Native POST errors are rendered in the download tab by the API. There
        // is no invented JSON redeem endpoint and no cross-origin file fetch.
        setToken(null);
        setMessage('لم يتأكد بدء التحميل. راجع تبويب التحميل لمعرفة السبب، ثم أعد تجهيز الرابط إذا لزم.');
        setState('FAILED');
      }
    } catch (error) { if (r.alive) fail(error); }
    finally { r.busy = false; }
  }, [accept, fail]);

  const submit = useCallback((form: HTMLFormElement): boolean => {
    const r = refs.current;
    if (r.busy || r.submitted || state !== 'READY' || !token || !r.request || !r.csrf) return false;
    if (secondsLeft(r.tokenAt) === 0 || secondsLeft(r.expiresAt) === 0) {
      setToken(null); setState('EXPIRED'); return false;
    }
    r.busy = true;
    r.submitted = true;
    // Synchronous native POST inside the user's gesture. Never fetch an APK/Blob.
    HTMLFormElement.prototype.submit.call(form);
    setToken(null); setState('DOWNLOADING');
    r.busy = false;
    return true;
  }, [state, token]);

  useEffect(() => {
    const r = refs.current;
    r.alive = true;
    const saved = storageKey ? readSaved(storageKey) : {};
    if (!r.key) r.key = saved.idempotencyKey || '';
    if (saved.requestId && !r.request && !r.busy) {
      r.busy = true; setState('LOADING');
      downloadApi.status(saved.requestId).then(result => { if (r.alive) accept(result); })
        .catch(error => { if (r.alive) fail(error); }).finally(() => { r.busy = false; });
    }
    return () => { r.alive = false; };
  }, [accept, fail, storageKey]);

  useEffect(() => {
    if (!['COUNTDOWN', 'READY', 'RATE_LIMITED', 'FAILED'].includes(state)) return;
    const tick = () => {
      const r = refs.current;
      if (state === 'COUNTDOWN') {
        if (secondsLeft(r.expiresAt) === 0) { setState('EXPIRED'); return; }
        const value = secondsLeft(r.readyAt); setRemaining(value);
        if (value === 0) void issue();
      } else if (state === 'READY') {
        const value = secondsLeft(r.tokenAt); setRemaining(value);
        if (value === 0) { setToken(null); setState('EXPIRED'); }
      } else setRemaining(secondsLeft(r.retryAt));
    };
    const interval = window.setInterval(tick, 250);
    const visible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', visible);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', visible); };
  }, [issue, state]);

  useEffect(() => {
    if (state !== 'DOWNLOADING') return;
    const timeout = window.setTimeout(() => void check(), 3000);
    return () => clearTimeout(timeout);
  }, [check, state]);

  return { state, remaining, message, token, csrf, requestId, prepare, submit, check };
}
