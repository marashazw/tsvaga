// The Help Center is deliberately a SEPARATE deployment (its own Vercel
// project, its own domain) rather than another page on tsvaga.app. That
// separation matters: this app is distributed as an Android app via a
// Trusted Web Activity wrapper, and Google Play's payments policy requires
// that in-app purchases of digital goods/services go through Google Play
// Billing unless the app avoids presenting any purchase flow at all. Since
// Tsvaga's vendor subscription, priority boosts, and ads are paid via
// EcoCash rather than Play Billing, none of that payment collection UI is
// shown inside the app (or even inside this same verified web origin,
// which the installed app would render without browser chrome, making it
// functionally "in the app" either way). Instead, the app only ever links
// OUT to this separate site, which opens in a real external browser.
//
// UPDATE THIS after deploying the help-center/ folder as its own Vercel
// project - replace with whatever domain you attach to it (e.g.
// https://help.tsvaga.app once that subdomain is set up, or the Vercel-
// assigned domain like https://tsvaga-help.vercel.app if you skip a
// custom domain for now).
export const HELP_CENTER_URL = 'https://tsvagahelpcenter.vercel.app';
