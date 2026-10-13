// Support & feedback links — decoupled from employment.
//
// SAFETY: keep this file free of personal work identifiers (no employee phone
// numbers, work emails, or agency branding). Donations are voluntary, never
// required to use the app, and are not payment for any official service.
// Fill these in with public, maintainer-owned channels when ready.

export interface DonateOption {
  /** Short channel name shown on buttons, e.g. 'PayMongo'. */
  label: string;
  url: string;
  /** One-line hint, e.g. 'Cards, GCash, Maya'. */
  blurb: string;
}

export const SUPPORT = {
  // e.g. 'https://github.com/<you>/<repo>/issues' — bug reports / questions.
  helpUrl: 'https://github.com/Broadmaker/dtr-tool/issues',
  // Primary channel: QR codes and the top-bar button point here.
  // Live PayMongo storefront — voluntary support, never required to use the app.
  donateUrl: 'https://storefront.paymongo.com/broadmarker',
  // All channels, first = primary. Add/remove entries to change where the
  // support card and print dialog point. Empty array hides donation UI.
  donateOptions: [
    { label: 'PayMongo', url: 'https://storefront.paymongo.com/broadmarker', blurb: 'Cards, GCash, Maya' },
    { label: 'Ko-fi', url: 'https://ko-fi.com/broadmaker', blurb: 'Tip jar' },
  ] as DonateOption[],
} as const;
