(function (Drupal, once) {
  'use strict';

  const storageKey = 'dwars-theme';

  function resolvedTheme() {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === 'dark' || stored === 'light') {
      return stored;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
    document.querySelectorAll('[data-dwars-theme-toggle]').forEach((button) => {
      const isDark = theme === 'dark';
      button.setAttribute('aria-pressed', String(isDark));
      button.setAttribute('aria-label', isDark ? 'Lichte modus gebruiken' : 'Donkere modus gebruiken');
      const label = button.querySelector('[data-theme-label]');
      if (label) label.textContent = isDark ? 'Licht' : 'Donker';
      button.querySelectorAll('[data-theme-icon]').forEach((icon) => {
        icon.hidden = icon.dataset.themeIcon !== theme;
      });
    });
  }

  Drupal.behaviors.dwarsTheme = {
    attach(context) {
      once('dwars-image-fallback', 'main img', context).forEach((image) => {
        const hideBrokenImage = () => {
          image.hidden = true;
          image.closest('.dwars-hero-image, .dwars-card-image, .dwars-edition-cover, .dwars-article-image')?.classList.add('dwars-image-missing');
        };
        if (image.complete && image.naturalWidth === 0) {
          hideBrokenImage();
        }
        else {
          image.addEventListener('error', hideBrokenImage, { once: true });
        }
      });

      once('dwars-theme-toggle', '[data-dwars-theme-toggle]', context).forEach((button) => {
        applyTheme(resolvedTheme());
        button.addEventListener('click', () => {
          const theme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
          window.localStorage.setItem(storageKey, theme);
          applyTheme(theme);
        });
      });

      once('dwars-mobile-menu', '[data-dwars-menu-toggle]', context).forEach((button) => {
        const menu = document.getElementById(button.getAttribute('aria-controls'));
        if (!menu) return;
        const close = () => {
          button.setAttribute('aria-expanded', 'false');
          menu.dataset.open = 'false';
          document.body.classList.remove('dwars-menu-open');
        };
        button.addEventListener('click', () => {
          const open = button.getAttribute('aria-expanded') !== 'true';
          button.setAttribute('aria-expanded', String(open));
          menu.dataset.open = String(open);
          document.body.classList.toggle('dwars-menu-open', open);
        });
        menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', close));
        document.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') close();
        });
      });

      once('dwars-krom-spin', '[data-dwars-krom]', context).forEach((link) => {
        link.addEventListener('click', () => {
          document.querySelectorAll('[data-dwars-logo]').forEach((logo) => {
            logo.classList.remove('animate-logo-spin');
            void logo.offsetWidth;
            logo.classList.add('animate-logo-spin');
          });
        });
      });

    }
  };

  document.documentElement.classList.remove('no-js');
  applyTheme(resolvedTheme());
})(Drupal, once);
