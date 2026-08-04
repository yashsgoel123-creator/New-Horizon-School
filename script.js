// ============================================================
// NEW HORIZON SCHOOL — shared interactions & animations
// ============================================================

document.addEventListener('DOMContentLoaded', () => {

  /* ---- Intro logo animation (home page only) ---- */
  const intro = document.querySelector('#intro-loader');
  if (intro) {
    const finishIntro = () => intro.classList.add('hide');
    setTimeout(finishIntro, 2600);
    intro.addEventListener('click', finishIntro);
  }

  /* ---- Sticky header shrink/blur on scroll ---- */
  const header = document.querySelector('header');
  const onScroll = () => {
    if (window.scrollY > 24) header.classList.add('scrolled');
    else header.classList.remove('scrolled');

    const toTop = document.querySelector('.fab.to-top');
    if (toTop) {
      if (window.scrollY > 600) toTop.classList.add('show');
      else toTop.classList.remove('show');
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---- Mobile menu toggle ---- */
  const toggle = document.querySelector('.menu-toggle');
  const mobileNav = document.querySelector('.mobile-nav');
  if (toggle && mobileNav) {
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('open');
      mobileNav.classList.toggle('open');
      document.body.style.overflow = mobileNav.classList.contains('open') ? 'hidden' : '';
    });
    mobileNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      toggle.classList.remove('open');
      mobileNav.classList.remove('open');
      document.body.style.overflow = '';
    }));
  }

  /* ---- Highlight active nav link by current page ---- */
  const page = (location.pathname.split('/').pop() || 'index.html');
  document.querySelectorAll('nav a, .mobile-nav a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === page || (page === '' && href === 'index.html')) {
      a.classList.add('active');
    }
  });

  /* ---- Scroll reveal (Intersection Observer) ---- */
  const revealEls = document.querySelectorAll('.reveal, .reveal-stagger, .horizon-track');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('is-visible'));
  }

  /* ---- Animated stat counters ---- */
  const counters = document.querySelectorAll('[data-count]');
  if (counters.length && 'IntersectionObserver' in window) {
    const countIo = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const target = parseFloat(el.dataset.count);
        const suffix = el.dataset.suffix || '';
        const prefix = el.dataset.prefix || '';
        const decimals = el.dataset.decimals ? parseInt(el.dataset.decimals) : 0;
        const duration = 1400;
        const start = performance.now();
        const step = (now) => {
          const p = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          const val = target * eased;
          el.textContent = prefix + val.toLocaleString('en-IN', {
            minimumFractionDigits: decimals, maximumFractionDigits: decimals
          }) + suffix;
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
        countIo.unobserve(el);
      });
    }, { threshold: 0.4 });
    counters.forEach(el => countIo.observe(el));
  }

  /* ---- Back to top ---- */
  const toTopBtn = document.querySelector('.fab.to-top');
  if (toTopBtn) {
    toTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  /* ---- Gallery filters (campus.html) ---- */
  const filters = document.querySelectorAll('.g-filter');
  if (filters.length) {
    const items = document.querySelectorAll('[data-g-cat]');
    filters.forEach(f => {
      f.addEventListener('click', () => {
        filters.forEach(x => x.classList.remove('active'));
        f.classList.add('active');
        const cat = f.dataset.filter;
        items.forEach(it => {
          const show = (cat === 'all' || it.dataset.gCat === cat);
          it.style.display = show ? '' : 'none';
        });
      });
    });
  }

  /* ---- Fee tabs (fees.html) ---- */
  const feeTabs = document.querySelectorAll('.fee-tab');
  if (feeTabs.length) {
    const panels = document.querySelectorAll('[data-fee-panel]');
    feeTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        feeTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.feeTab;
        panels.forEach(p => {
          p.style.display = (p.dataset.feePanel === target) ? '' : 'none';
        });
      });
    });
  }

 /* ---- Contact form submit feedback (contact.html) ---- */
  const contactForm = document.querySelector('#enquiry-form');
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = contactForm.querySelector('.submit-btn');
      const originalText = btn.textContent;
      btn.textContent = 'Sending...';
      btn.disabled = true;

      const formData = new FormData(contactForm);

      fetch(contactForm.action, {
        method: 'POST',
        body: formData,
        headers: { 'Accept': 'application/json' }
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.success) {
            btn.textContent = 'Enquiry received ✓';
            btn.classList.add('sent');
            contactForm.reset();
          } else {
            btn.textContent = 'Something went wrong. Try again';
            btn.disabled = false;
          }
        })
        .catch(() => {
          btn.textContent = 'Something went wrong. Try again';
          btn.disabled = false;
        });
    });
  }

});