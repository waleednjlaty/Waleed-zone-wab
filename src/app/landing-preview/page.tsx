import type { Metadata } from 'next';
import Brand from '@/components/Brand';
import { TELEGRAM_BOT_URL, TELEGRAM_CHANNEL_URL } from '@/lib/site';

const LIVE_SITE_URL = 'https://www.waleedzone.xyz';

export const metadata: Metadata = {
  title: 'Waleed Zone — تجربة الصفحة التعريفية',
  description: 'اكتشف تطبيقات وألعاب Waleed Zone وتابع آخر التحديثات عبر تيليغرام.',
  robots: { index: false, follow: false, noarchive: true },
};

function SparkIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 1.7 7.1L21 12l-7.3 2.9L12 22l-1.7-7.1L3 12l7.3-2.9L12 2Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="m19 2 .7 2.3L22 5l-2.3.7L19 8l-.7-2.3L16 5l2.3-.7L19 2Z" fill="currentColor"/></svg>;
}
function ArrowIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function AppIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.7"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.7"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.7"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.7"/></svg>;
}
function GameIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 8h9.6a4 4 0 0 1 3.8 2.8l1 3.7a2.8 2.8 0 0 1-4.6 2.8l-2.1-1.8H9.1L7 17.3a2.8 2.8 0 0 1-4.6-2.8l1-3.7A4 4 0 0 1 7.2 8Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M8 10.8v4m-2-2h4m6-1h.01M18 14h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
}
function SendIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 3-7.4 18-3.8-7.8L2 9.4 21 3Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="m9.8 13.2 4.8-4.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>;
}
function CheckIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

const benefits = [
  { number: '01', title: 'كل شيء بمكان واحد', description: 'تصفح التطبيقات والألعاب من واجهة واحدة مرتبة وواضحة.' },
  { number: '02', title: 'تفاصيل قبل التحميل', description: 'اطّلع على معلومات التطبيق والإصدار والمنصة قبل أن تقرر.' },
  { number: '03', title: 'ابقَ على اطلاع', description: 'تابع قناة تيليغرام لتعرف ما الجديد فور إضافته.' },
];

export default function LandingPreview() {
  return (
    <div className="wz-landing-preview" dir="rtl">
      <div className="wzl-topline"><span>مساحة رقمية واحدة، خيارات أكثر</span><span className="wzl-topline-mark">WZ / 2026</span></div>
      <header className="wzl-header">
        <div className="wzl-container wzl-header-inner">
          <a href="/landing-preview" aria-label="Waleed Zone"><Brand /></a>
          <nav className="wzl-nav" aria-label="التنقل الرئيسي">
            <a href="#discover">اكتشف</a>
            <a href="#features">المميزات</a>
            <a href="#community">مجتمعنا</a>
          </nav>
          <a className="wzl-header-cta" href={`${LIVE_SITE_URL}/apps`} target="_blank" rel="noopener noreferrer">تصفّح المكتبة <ArrowIcon /></a>
        </div>
      </header>

      <main>
        <section className="wzl-hero wzl-container" id="discover">
          <div className="wzl-hero-copy">
            <div className="wzl-eyebrow"><span className="wzl-eyebrow-dot" /> بوابتك إلى عالم التطبيقات والألعاب</div>
            <h1>اكتشف أكثر.<br /><span>واختر بذكاء.</span></h1>
            <p className="wzl-hero-description">كل ما تحتاجه من تطبيقات وألعاب في مكان واحد. تصفّح، اعرف التفاصيل، وتابع جديد Waleed Zone أولاً بأول.</p>
            <div className="wzl-actions">
              <a className="wzl-button wzl-button-primary" href={`${LIVE_SITE_URL}/apps`} target="_blank" rel="noopener noreferrer">استكشف المكتبة <ArrowIcon /></a>
              <a className="wzl-button wzl-button-secondary" href={TELEGRAM_CHANNEL_URL} target="_blank" rel="noopener noreferrer"><SendIcon /> انضم إلى القناة</a>
            </div>
            <div className="wzl-proof-row">
              <span><CheckIcon /> تصفّح سهل</span>
              <span><CheckIcon /> تفاصيل واضحة</span>
              <span><CheckIcon /> تحديثات مستمرة</span>
            </div>
          </div>

          <div className="wzl-hero-visual" aria-label="معاينة توضيحية لمكتبة Waleed Zone">
            <div className="wzl-visual-label"><span>WZ / DIGITAL LIBRARY</span><span>01 — 03</span></div>
            <div className="wzl-library-card">
              <div className="wzl-library-brand">
                <div className="wzl-monogram">WZ<span>.</span></div>
                <div><small>WALEED ZONE</small><strong>مكتبتك الرقمية</strong></div>
                <span className="wzl-live-dot" aria-label="متاح للتصفح" />
              </div>
              <div className="wzl-library-heading"><span>ابدأ من هنا</span><b>شو حابب تكتشف اليوم؟</b></div>
              <div className="wzl-search" role="group" aria-label="البحث في مكتبة Waleed Zone">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="m16 16 5 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
                <span>ابحث عن تطبيق أو لعبة...</span>
                <a href={LIVE_SITE_URL} target="_blank" rel="noopener noreferrer">افتح</a>
              </div>
              <div className="wzl-shortcuts">
                <a href={`${LIVE_SITE_URL}/apps`} target="_blank" rel="noopener noreferrer" className="wzl-shortcut">
                  <span className="wzl-shortcut-icon wzl-icon-apps"><AppIcon /></span>
                  <span><b>التطبيقات</b><small>اكتشف أدوات جديدة</small></span>
                  <span className="wzl-shortcut-arrow">↗</span>
                </a>
                <a href={`${LIVE_SITE_URL}/games`} target="_blank" rel="noopener noreferrer" className="wzl-shortcut">
                  <span className="wzl-shortcut-icon wzl-icon-games"><GameIcon /></span>
                  <span><b>الألعاب</b><small>اختر لعبتك القادمة</small></span>
                  <span className="wzl-shortcut-arrow">↗</span>
                </a>
              </div>
              <a href={TELEGRAM_CHANNEL_URL} target="_blank" rel="noopener noreferrer" className="wzl-update-strip">
                <span className="wzl-update-icon"><SendIcon /></span>
                <span><small>خليك قريب من الجديد</small><b>تابع آخر التحديثات على تيليغرام</b></span>
                <span className="wzl-update-arrow">←</span>
              </a>
            </div>
            <div className="wzl-side-note"><span className="wzl-side-note-line" /> اكتشف مساحتك الرقمية</div>
          </div>
        </section>

        <section className="wzl-intro-band">
          <div className="wzl-container wzl-intro-inner">
            <span className="wzl-section-index">WZ — 001</span>
            <p>مش مجرد روابط تحميل.<br /><strong>تجربة أوضح لاكتشاف ما يناسبك.</strong></p>
            <span className="wzl-intro-mark"><SparkIcon /></span>
          </div>
        </section>

        <section className="wzl-section wzl-container" id="features">
          <div className="wzl-section-heading">
            <div><span className="wzl-section-kicker">WHY WALEED ZONE</span><h2>كل شيء أوضح،<br /><span>من أول نقرة.</span></h2></div>
            <p>صممنا Waleed Zone لتصل إلى ما تبحث عنه بسهولة، وتعرف ما تحتاج معرفته قبل التحميل.</p>
          </div>
          <div className="wzl-benefit-grid">
            {benefits.map((item) => (
              <article className="wzl-benefit" key={item.number}>
                <div className="wzl-benefit-top"><span>{item.number}</span><span className="wzl-benefit-mark"><SparkIcon /></span></div>
                <h3>{item.title}</h3><p>{item.description}</p>
                <div className="wzl-benefit-rule" />
              </article>
            ))}
          </div>
        </section>

        <section className="wzl-community-section" id="community">
          <div className="wzl-container wzl-community-card">
            <div className="wzl-community-icon"><SendIcon /></div>
            <div className="wzl-community-copy">
              <span className="wzl-section-kicker">STAY IN THE LOOP</span>
              <h2>الجديد ما لازم يفوتك.</h2>
              <p>انضم إلى قناة Waleed Zone على تيليغرام، وخليك على اطلاع بآخر التطبيقات والألعاب والإضافات.</p>
            </div>
            <div className="wzl-community-actions">
              <a className="wzl-button wzl-button-primary" href={TELEGRAM_CHANNEL_URL} target="_blank" rel="noopener noreferrer">اشترك بالقناة <ArrowIcon /></a>
              <a className="wzl-bot-link" href={TELEGRAM_BOT_URL} target="_blank" rel="noopener noreferrer">جرّب البوت أيضاً <span>↗</span></a>
            </div>
            <span className="wzl-community-watermark" aria-hidden="true">WZ</span>
          </div>
        </section>
      </main>

      <footer className="wzl-footer">
        <div className="wzl-container wzl-footer-inner">
          <div><Brand /><p>اكتشف. اختَر. وابقَ على اطلاع.</p></div>
          <div className="wzl-footer-links">
            <a href={`${LIVE_SITE_URL}/apps`} target="_blank" rel="noopener noreferrer">التطبيقات</a><a href={`${LIVE_SITE_URL}/games`} target="_blank" rel="noopener noreferrer">الألعاب</a>
            <a href={TELEGRAM_CHANNEL_URL} target="_blank" rel="noopener noreferrer">تيليغرام</a>
            <a href={LIVE_SITE_URL} target="_blank" rel="noopener noreferrer">المتجر الحالي</a>
          </div>
          <span className="wzl-copyright" dir="ltr">© {new Date().getFullYear()} Waleed Zone</span>
        </div>
      </footer>
    </div>
  );
}
