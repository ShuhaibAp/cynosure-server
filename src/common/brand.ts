export type BrandTheme = 'cynosure' | 'lterp';

export interface BrandConfig {
  theme: BrandTheme;
  appName: string;
  companyName: string;
  companyUpper: string;
  logoFile: string;
  brandHex: string;
  mailFromDefault: string;
  inviteIntro: string;
  resetIntro: string;
  inviteSubject: string;
  resetSubject: string;
}

const BRANDS: Record<BrandTheme, BrandConfig> = {
  cynosure: {
    theme: 'cynosure',
    appName: 'Cynosure MIS',
    companyName: 'Cynosure Recycling Private Limited',
    companyUpper: 'CYNOSURE RECYCLING',
    logoFile: 'cynosure-logo.png',
    brandHex: '#B44B14',
    mailFromDefault: 'Cynosure <onboarding@resend.dev>',
    inviteIntro:
      'Your quotation has been approved. Create a password to follow your order in the Cynosure customer app.',
    resetIntro: 'We received a request to reset your Cynosure password.',
    inviteSubject: 'Set your password to access your Cynosure account',
    resetSubject: 'Reset your Cynosure password',
  },
  lterp: {
    theme: 'lterp',
    appName: 'Lifecycle & Traceability ERP',
    companyName: 'Reviens Tech',
    companyUpper: 'REVIENS TECH',
    logoFile: 'brand-logo.png',
    brandHex: '#0F6B4E',
    mailFromDefault: 'Lifecycle & Traceability ERP <onboarding@resend.dev>',
    inviteIntro:
      'Your quotation has been approved. Create a password to follow your order in the customer portal.',
    resetIntro: 'We received a request to reset your password.',
    inviteSubject: 'Set your password to access your account',
    resetSubject: 'Reset your password',
  },
};

export function getBrand(): BrandConfig {
  const raw = (process.env.THEME ?? 'cynosure').trim().toLowerCase();
  return raw === 'lterp' ? BRANDS.lterp : BRANDS.cynosure;
}
