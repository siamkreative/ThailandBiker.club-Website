// Shared behavior for ThailandBiker.club legal/utility pages
(function () {
  // Sticky nav shadow
  const nav = document.getElementById('nav');
  if (nav) {
    const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // TOC active-section tracking
  const tocLinks = [...document.querySelectorAll('.toc a[href^="#"]')];
  if (tocLinks.length) {
    const sections = tocLinks
      .map(a => document.getElementById(a.getAttribute('href').slice(1)))
      .filter(Boolean);

    const setActive = (id) => {
      tocLinks.forEach(a => {
        a.classList.toggle('is-active', a.getAttribute('href') === '#' + id);
      });
    };

    if ('IntersectionObserver' in window && sections.length) {
      const seen = new Set();
      const io = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) seen.add(e.target.id);
          else seen.delete(e.target.id);
        });
        // Pick the first section in document order that's visible
        for (const s of sections) {
          if (seen.has(s.id)) {
            setActive(s.id);
            return;
          }
        }
      }, { rootMargin: '-88px 0px -65% 0px', threshold: 0 });
      sections.forEach(s => io.observe(s));
    }

    // Smooth scroll for in-page links
    tocLinks.forEach(a => {
      a.addEventListener('click', (e) => {
        const id = a.getAttribute('href').slice(1);
        const el = document.getElementById(id);
        if (el) {
          e.preventDefault();
          const top = el.getBoundingClientRect().top + window.scrollY - 80;
          window.scrollTo({ top, behavior: 'smooth' });
          history.replaceState(null, '', '#' + id);
        }
      });
    });
  }
})();
