export const languages = {
  en: 'English',
  de: 'Deutsch',
};

export const defaultLang = 'en';

export const translations = {
  en: {
    // Navigation
    'nav.home': 'Home',
    'nav.about': 'About',
    'nav.blog': 'Blog',
    'nav.projects': 'Projects',

    // Hero section
    'hero.greeting': "Hi, I'm",
    'hero.name': 'Varij Kapil',
    'hero.title': 'Head of Backend Engineering & Operations',
    'hero.location': 'Bonn, Germany',
    'hero.description': 'I transform legacy systems into scalable, multi-tenant SaaS platforms using Kubernetes and cloud-native architecture.',
    'hero.cta.about': 'Learn more about me',
    'hero.cta.blog': 'Read my blog',
    'hero.social': 'Find me on',

    // Skills section
    'skills.title': 'Technical',
    'skills.titleHighlight': 'Skills',
    'skills.languages': 'Languages',
    'skills.frameworks': 'Frameworks',
    'skills.platform': 'Platform & Cloud',
    'skills.tools': 'Tools',
    'skills.legend.expert': 'Expert / Daily use',
    'skills.legend.advanced': 'Advanced',
    'skills.legend.intermediate': 'Familiar',

    // Blog section
    'blog.title': 'Latest from the',
    'blog.titleHighlight': 'Blog',
    'blog.viewAll': 'View all posts',

    // CTA section
    'cta.title': "Let's Connect",
    'cta.description': "Feel free to reach out if you'd like to discuss technology, share ideas, or just say hello.",
    'cta.contact': 'Get in touch',
    'cta.github': 'View GitHub',

    // Footer
    'footer.rights': 'All rights reserved.',
  },
  de: {
    // Navigation
    'nav.home': 'Startseite',
    'nav.about': 'Über mich',
    'nav.blog': 'Blog',
    'nav.projects': 'Projekte',

    // Hero section
    'hero.greeting': 'Hallo, ich bin',
    'hero.name': 'Varij Kapil',
    'hero.title': 'Head of Backend Engineering & Operations',
    'hero.location': 'Bonn, Deutschland',
    'hero.description': 'Ich transformiere Legacy-Systeme in skalierbare, mandantenfähige SaaS-Plattformen mit Kubernetes und Cloud-nativer Architektur.',
    'hero.cta.about': 'Mehr über mich',
    'hero.cta.blog': 'Zum Blog',
    'hero.social': 'Finde mich auf',

    // Skills section
    'skills.title': 'Technische',
    'skills.titleHighlight': 'Fähigkeiten',
    'skills.languages': 'Sprachen',
    'skills.frameworks': 'Frameworks',
    'skills.platform': 'Plattform & Cloud',
    'skills.tools': 'Tools',
    'skills.legend.expert': 'Experte / Tägliche Nutzung',
    'skills.legend.advanced': 'Fortgeschritten',
    'skills.legend.intermediate': 'Vertraut',

    // Blog section
    'blog.title': 'Neueste',
    'blog.titleHighlight': 'Blogbeiträge',
    'blog.viewAll': 'Alle Beiträge',

    // CTA section
    'cta.title': 'Kontakt aufnehmen',
    'cta.description': 'Schreib mir gerne, wenn du über Technologie diskutieren, Ideen austauschen oder einfach Hallo sagen möchtest.',
    'cta.contact': 'Kontakt',
    'cta.github': 'GitHub ansehen',

    // Footer
    'footer.rights': 'Alle Rechte vorbehalten.',
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

export function getLangFromUrl(url: URL) {
  const [, lang] = url.pathname.split('/');
  if (lang in translations) return lang as keyof typeof translations;
  return defaultLang;
}

export function useTranslations(lang: keyof typeof translations) {
  return function t(key: TranslationKey) {
    return translations[lang][key] || translations[defaultLang][key];
  };
}

export function getLocalizedPath(path: string, lang: string) {
  if (lang === defaultLang) {
    return path;
  }
  return `/${lang}${path}`;
}
