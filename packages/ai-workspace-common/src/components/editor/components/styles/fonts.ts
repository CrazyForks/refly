import localFont from 'next/font/local';
import { Crimson_Text, Inconsolata, Inter } from 'next/font/google';

export const cal = localFont({
  src: './CalSans-SemiBold.otf',
  variable: '--font-title',
});

export const xinye = localFont({
  src: './新叶念体.otf',
  variable: '--font-xinye',
  display: 'swap',
  fallback: ['sans-serif'],
  preload: true,
  style: {
    fontFamily: '新叶念体',
  },
});

export const crimsonBold = Crimson_Text({
  weight: '700',
  variable: '--font-title',
  subsets: ['latin'],
});

export const inter = Inter({
  variable: '--font-default',
  subsets: ['latin'],
});

export const inconsolataBold = Inconsolata({
  weight: '700',
  variable: '--font-title',
  subsets: ['latin'],
});

export const crimson = Crimson_Text({
  weight: '400',
  variable: '--font-default',
  subsets: ['latin'],
});

export const inconsolata = Inconsolata({
  variable: '--font-default',
  subsets: ['latin'],
});

export const titleFontMapper = {
  Default: cal.variable,
  Serif: crimsonBold.variable,
  Mono: inconsolataBold.variable,
  Xinye: xinye.variable,
};

export const defaultFontMapper = {
  Default: inter.variable,
  Serif: crimson.variable,
  Mono: inconsolata.variable,
  Xinye: xinye.variable,
};
