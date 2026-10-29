'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useLocale } from '@/components/LocaleProvider';
import { appName, isGame } from '@/components/catalog/presentation';
import { appHref } from '@/lib/catalog/routes';
import { safeExternalUrl } from '@/lib/utils';

export type SpotlightItem = {
  id: number;
  name: string | null;
  category: string | null;
  description: string | null;
  version: string | null;
  size: string | null;
  platform: string | null;
  imageUrl: string | null;
};

export default function SpotlightCarousel({ apps }: { apps: SpotlightItem[] }) {
  const locale = useLocale();
  const english = locale === 'en';
  const [activeIndex, setActiveIndex] = useState(0);
  const [autoRequested, setAutoRequested] = useState(true);
  const [focusPaused, setFocusPaused] = useState(false);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [motionOverride, setMotionOverride] = useState(false);
  const pointerWasRotating = useRef(false);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener?.('change', update);
    return () => preference.removeEventListener?.('change', update);
  }, []);

  const wantsRotation = autoRequested && (!reducedMotion || motionOverride);
  const rotating = apps.length > 1 && wantsRotation && !focusPaused && !hoverPaused;

  useEffect(() => {
    if (!rotating) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % apps.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [rotating, apps.length]);

  if (!apps.length) return null;

  const active = apps[activeIndex] ?? apps[0];
  const activeName = appName(active, locale);
  const description = active.description?.replace(/\s+/g, ' ').trim();
  const shortDescription = description
    ? (description.length > 150 ? `${description.slice(0, 147).trimEnd()}…` : description)
    : english
      ? 'Explore the details, version information and available download options.'
      : 'اكتشف تفاصيل التطبيق وإصداره وخيارات التحميل المتاحة.';
  const imageUrl = safeExternalUrl(active.imageUrl);
  const version = active.version?.trim();
  const size = active.size?.trim();
  const platform = active.platform?.trim();
  const meaningful = (value?: string) => Boolean(value && !/^[-–—.]+$/.test(value));

  const move = (direction: -1 | 1) => {
    setActiveIndex((current) => (current + direction + apps.length) % apps.length);
  };

  const toggleRotation = () => {
    if (pointerWasRotating.current) {
      setAutoRequested(false);
      setMotionOverride(false);
      setFocusPaused(false);
    } else {
      setAutoRequested(true);
      setMotionOverride(true);
      setFocusPaused(false);
    }
    pointerWasRotating.current = false;
  };

  return (
    <section
      className="spotlight-carousel"
      role="region"
      aria-roledescription={english ? 'carousel' : 'عارض شرائح'}
      aria-label={english ? 'Discover apps and games' : 'اكتشف تطبيقات وألعابًا'}
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onFocusCapture={() => setFocusPaused(true)}
    >
      {apps.map((app, index) => {
        const isActive = index === activeIndex;
        const name = appName(app, locale);
        const safeImage = safeExternalUrl(app.imageUrl);
        const href = appHref(app);

        return (
          <article
            key={app.id}
            className={`spotlight-slide${isActive ? ' is-active' : ''}`}
            aria-roledescription={english ? 'slide' : 'شريحة'}
            aria-label={english ? `${index + 1} of ${apps.length}: ${name}` : `${index + 1} من ${apps.length}: ${name}`}
            aria-hidden={!isActive}
          >
            <div className="spotlight-art" aria-hidden="true">
              {safeImage && (
                // eslint-disable-next-line @next/next/no-img-element -- remote catalog artwork is validated before rendering.
                <img
                  src={safeImage}
                  alt=""
                  loading={isActive ? 'eager' : 'lazy'}
                  fetchPriority={isActive ? 'high' : 'auto'}
                  decoding="async"
                />
              )}
            </div>
            <div className="spotlight-content">
              <div className="spotlight-copy">
                <span className="spotlight-kicker">
                  <span className="spotlight-kicker-dot" aria-hidden="true" />
                  {english ? 'A random pick from the library' : 'اقتراح عشوائي من المكتبة'}
                </span>
                <p className="spotlight-kind">
                  {english ? (isGame(app) ? 'GAME TO DISCOVER' : 'APP TO DISCOVER') : (isGame(app) ? 'لعبة تستحق الاكتشاف' : 'تطبيق يستحق الاكتشاف')}
                </p>
                <h2 dir="auto">{name}</h2>
                <p className="spotlight-description" dir="auto">{shortDescription}</p>
                <div className="spotlight-meta" aria-label={english ? 'App details' : 'تفاصيل التطبيق'}>
                  {app.category?.trim() && <span>{app.category}</span>}
                  {meaningful(version) && <span dir="auto">{/^\d/.test(version!) ? `v${version}` : version}</span>}
                  {meaningful(platform) && <span dir="auto">{platform}</span>}
                  {meaningful(size) && <span dir="auto">{size}</span>}
                </div>
                <Link className="spotlight-cta" href={href} tabIndex={isActive ? 0 : -1}>
                  {english ? 'Explore details' : 'اكتشف التفاصيل'}
                  <span aria-hidden="true">{english ? '→' : '←'}</span>
                </Link>
              </div>
              <Link
                className="spotlight-app-mark"
                href={href}
                aria-label={english ? `Details for ${name}` : `تفاصيل ${name}`}
                tabIndex={isActive ? 0 : -1}
              >
                {safeImage ? (
                  // eslint-disable-next-line @next/next/no-img-element -- validated catalog artwork.
                  <img src={safeImage} alt="" loading={isActive ? 'eager' : 'lazy'} decoding="async" />
                ) : (
                  <span className="spotlight-mark-fallback" aria-hidden="true">WZ</span>
                )}
              </Link>
            </div>
          </article>
        );
      })}

      <div className="spotlight-controls">
        <div className="spotlight-control-group">
          {apps.length > 1 && (
            <>
              <button className="spotlight-arrow" type="button" onClick={() => move(-1)} aria-label={english ? 'Previous slide' : 'الشريحة السابقة'}>
                <span aria-hidden="true">{english ? '←' : '→'}</span>
              </button>
              <button className="spotlight-arrow" type="button" onClick={() => move(1)} aria-label={english ? 'Next slide' : 'الشريحة التالية'}>
                <span aria-hidden="true">{english ? '→' : '←'}</span>
              </button>
              <button
                className="spotlight-rotation"
                type="button"
                aria-label={wantsRotation ? (english ? 'Stop automatic rotation' : 'إيقاف التبديل التلقائي') : (english ? 'Start automatic rotation' : 'تشغيل التبديل التلقائي')}
                onPointerDown={() => { pointerWasRotating.current = wantsRotation && !focusPaused; }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    pointerWasRotating.current = wantsRotation && !focusPaused;
                  }
                }}
                onClick={toggleRotation}
              >
                <span aria-hidden="true">{wantsRotation ? 'Ⅱ' : '▶'}</span>
              </button>
            </>
          )}
        </div>
        {apps.length > 1 && (
          <div className="spotlight-dots" role="group" aria-label={english ? 'Choose a slide' : 'اختر شريحة'}>
            {apps.map((app, index) => (
              <button
                key={app.id}
                className={`spotlight-dot${index === activeIndex ? ' is-active' : ''}`}
                type="button"
                aria-label={english ? `Show slide ${index + 1}: ${appName(app, locale)}` : `اعرض الشريحة ${index + 1}: ${appName(app, locale)}`}
                aria-pressed={index === activeIndex}
                onClick={() => setActiveIndex(index)}
              />
            ))}
          </div>
        )}
      </div>
      <p className="sr-only" aria-live={rotating ? 'off' : 'polite'} aria-atomic="true">
        {english ? `Slide ${activeIndex + 1} of ${apps.length}: ${activeName}` : `الشريحة ${activeIndex + 1} من ${apps.length}: ${activeName}`}
      </p>
    </section>
  );
}
