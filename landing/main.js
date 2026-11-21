/* Meta Pixel: configuração e consentimento */
      const META_PIXEL_ID = document.querySelector('meta[name="meta-pixel-id"]')?.content.trim() || "";
      const MARKETING_CONSENT_KEY = "alvoprompter_marketing_consent_v1";
      const consentPanel = document.getElementById("privacyConsent");
      let marketingAllowed = false;
      let metaPixelLoaded = false;

      const readMarketingConsent = () => {
        try { return localStorage.getItem(MARKETING_CONSENT_KEY); }
        catch { return null; }
      };

      const saveMarketingConsent = (value) => {
        try { localStorage.setItem(MARKETING_CONSENT_KEY, value); }
        catch { /* O site continua funcionando quando o armazenamento está bloqueado. */ }
      };

      const validMetaPixelId = () => /^\d{5,25}$/.test(META_PIXEL_ID);

      const loadMetaPixel = () => {
        if (!marketingAllowed || metaPixelLoaded || !validMetaPixelId()) return false;
        /* Snippet oficial carregado somente depois do consentimento. */
        ((f, b, e, v, n, t, s) => {
          if (f.fbq) return;
          n = f.fbq = function () { if (n.callMethod) n.callMethod.apply(n, arguments); else n.queue.push(arguments); };
          if (!f._fbq) f._fbq = n;
          n.push = n;
          n.loaded = true;
          n.version = "2.0";
          n.queue = [];
          t = b.createElement(e);
          t.async = true;
          t.src = v;
          s = b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t, s);
        })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
        window.fbq("consent", "grant");
        window.fbq("init", META_PIXEL_ID);
        window.fbq("track", "PageView");
        window.fbq("track", "ViewContent", { content_name: "AlvoPrompter Landing Page", content_category: "SaaS" });
        metaPixelLoaded = true;
        return true;
      };

      const trackMetaEvent = (method, eventName, params = {}) => {
        if (!marketingAllowed || !metaPixelLoaded || typeof window.fbq !== "function") return;
        window.fbq(method, eventName, params);
      };

      const chooseMarketingConsent = (allowed) => {
        marketingAllowed = allowed;
        saveMarketingConsent(allowed ? "granted" : "denied");
        consentPanel.hidden = true;
        if (allowed) loadMetaPixel();
        else if (typeof window.fbq === "function") window.fbq("consent", "revoke");
      };

      document.getElementById("consentMarketing").addEventListener("click", () => chooseMarketingConsent(true));
      document.getElementById("consentEssential").addEventListener("click", () => chooseMarketingConsent(false));
      document.getElementById("privacySettings").addEventListener("click", () => {
        consentPanel.hidden = false;
        document.getElementById("consentMarketing").focus();
      });

      const savedMarketingConsent = readMarketingConsent();
      if (savedMarketingConsent === "granted") {
        marketingAllowed = true;
        loadMetaPixel();
      } else if (savedMarketingConsent !== "denied") {
        consentPanel.hidden = false;
      }

      const APP_BASE_META = document.querySelector('meta[name="app-base"]')?.content.trim();
      const APP_URL = APP_BASE_META
        ? APP_BASE_META.replace(/\/$/, "") + "/"
        : (window.location.protocol === "file:"
          ? "http://127.0.0.1:5173/"
          : new URL("/", window.location.origin).href);
      document.querySelectorAll(".js-app").forEach((a) => {
        const path = a.dataset.appPath || "";
        a.href = new URL(path.replace(/^\//, ""), APP_URL).href;
        a.removeAttribute("target");
        a.removeAttribute("rel");
        a.addEventListener("click", () => {
          const plan = new URL(a.href).searchParams.get("plan");
          const ctaLabel = a.textContent.trim().replace(/\s+/g, " ").slice(0, 80);
          if (plan) {
            const planPrices = { creator: 29.9, studio: 79.9 };
            trackMetaEvent("trackCustom", "SelectPlan", {
              content_name: `Plano ${plan}`,
              content_category: "Assinatura",
              value: planPrices[plan] || 0,
              currency: "BRL",
            });
          } else {
            trackMetaEvent("trackCustom", "StartRegistration", {
              source: "landing_page",
              cta_label: ctaLabel,
            });
          }
        });
      });

      /* Reveal on scroll */
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
          });
        },
        { threshold: 0.12 }
      );
      document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

      /* Scroll progress */
      const progress = document.getElementById("progress");
      const onScroll = () => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        progress.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + "%";
        document.getElementById("toTop").classList.toggle("show", window.scrollY > 600);
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
      document.getElementById("toTop").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

      /* Mobile menu */
      const menuBtn = document.getElementById("menuBtn");
      const mobileMenu = document.getElementById("mobileMenu");
      menuBtn.addEventListener("click", () => mobileMenu.classList.toggle("hidden"));
      document.querySelectorAll(".mobile-link").forEach((l) =>
        l.addEventListener("click", () => mobileMenu.classList.add("hidden"))
      );

      /* Active nav link */
      const navLinks = document.querySelectorAll(".nav-link");
      const navObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              navLinks.forEach((l) => l.classList.toggle("active", l.getAttribute("href") === "#" + e.target.id));
            }
          });
        },
        { rootMargin: "-45% 0px -50% 0px" }
      );
      ["app", "recursos", "comparativo", "precos", "faq"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) navObserver.observe(el);
      });

      /* Contadores */
      const counterIO = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (!e.isIntersecting) return;
            counterIO.unobserve(e.target);
            const el = e.target;
            const target = parseInt(el.dataset.target, 10);
            const dur = 1200;
            const start = performance.now();
            const step = (now) => {
              const p = Math.min((now - start) / dur, 1);
              el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
              if (p < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
          });
        },
        { threshold: 0.6 }
      );
      document.querySelectorAll(".counter").forEach((el) => counterIO.observe(el));

      /* Carrossel do hero */
      const carousel = document.querySelector("[data-carousel]");
      if (carousel) {
        const track = carousel.querySelector("[data-carousel-track]");
        const label = carousel.querySelector("[data-carousel-label]");
        const dotsWrap = carousel.querySelector("[data-carousel-dots]");
        const slides = Array.from(track.children);
        const labels = ["AlvoPrompter — prompter", "AlvoPrompter — editor", "AlvoPrompter — painel de IA", "AlvoPrompter — análise", "AlvoPrompter — control room"];
        let idx = 0;
        let timer;

        slides.forEach((_, i) => {
          const d = document.createElement("button");
          d.className = "carousel-dot" + (i === 0 ? " active" : "");
          d.setAttribute("aria-label", "Ir para o slide " + (i + 1));
          d.addEventListener("click", () => { go(i); restart(); });
          dotsWrap.appendChild(d);
        });
        const dots = dotsWrap.children;

        const go = (i) => {
          idx = (i + slides.length) % slides.length;
          track.style.transform = "translateX(-" + idx * 100 + "%)";
          label.textContent = labels[idx];
          Array.from(dots).forEach((d, j) => d.classList.toggle("active", j === idx));
        };
        const restart = () => { clearInterval(timer); timer = setInterval(() => go(idx + 1), 4200); };
        carousel.querySelector("[data-carousel-prev]").addEventListener("click", () => { go(idx - 1); restart(); });
        carousel.querySelector("[data-carousel-next]").addEventListener("click", () => { go(idx + 1); restart(); });
        carousel.addEventListener("mouseenter", () => clearInterval(timer));
        carousel.addEventListener("mouseleave", restart);
        restart();
      }

      /* Accessible demo tabs, with CSS anchors and a measured fallback. */
      const tabList = document.querySelector("[data-tabs]");
      const tabBtns = Array.from(tabList.querySelectorAll("[data-tab]"));
      tabList.setAttribute("aria-label", "Conheça o aplicativo");
      const highlight = document.createElement("span");
      highlight.className = "tab-highlight";
      highlight.setAttribute("aria-hidden", "true");
      tabList.append(highlight);
      const updateHighlight = () => {
        const active = tabList.querySelector(".tab-btn.active");
        for (const [name, value] of Object.entries({ left: active.offsetLeft, top: active.offsetTop, width: active.offsetWidth, height: active.offsetHeight })) {
          tabList.style.setProperty("--tab-" + name, value + "px");
        }
      };
      const selectTab = (selected) => {
        tabBtns.forEach((btn) => {
          const active = btn === selected;
          btn.classList.toggle("active", active);
          btn.setAttribute("aria-selected", String(active));
          btn.tabIndex = active ? 0 : -1;
          const panel = document.querySelector('[data-panel="' + btn.dataset.tab + '"]');
          panel.classList.toggle("active", active);
          panel.hidden = !active;
        });
        updateHighlight();
      };
      tabBtns.forEach((btn, index) => {
        btn.id = "demo-tab-" + btn.dataset.tab;
        const panel = document.querySelector('[data-panel="' + btn.dataset.tab + '"]');
        panel.id = "demo-panel-" + btn.dataset.tab;
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", btn.id);
        panel.tabIndex = 0;
        btn.setAttribute("aria-controls", panel.id);
        btn.addEventListener("click", () => selectTab(btn));
        btn.addEventListener("keydown", (event) => {
          let next;
          if (event.key === "ArrowRight") next = (index + 1) % tabBtns.length;
          if (event.key === "ArrowLeft") next = (index - 1 + tabBtns.length) % tabBtns.length;
          if (event.key === "Home") next = 0;
          if (event.key === "End") next = tabBtns.length - 1;
          if (next === undefined) return;
          event.preventDefault();
          selectTab(tabBtns[next]);
          tabBtns[next].focus();
        });
      });
      selectTab(tabBtns[0]);
      tabList.classList.add("enhanced");
      new ResizeObserver(updateHighlight).observe(tabList);
      document.fonts.ready.then(updateHighlight);

      /* Keep native details semantics while animating both directions. */
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
      document.querySelectorAll("#faq details").forEach((details) => {
        const summary = details.querySelector("summary");
        let animation;
        let expanded = details.open;
        summary.querySelector(".chev").setAttribute("aria-hidden", "true");
        summary.addEventListener("click", (event) => {
          event.preventDefault();
          const from = details.getBoundingClientRect().height;
          animation?.cancel();
          expanded = !expanded;
          details.dataset.expanded = String(expanded);
          if (reducedMotion.matches) { details.open = expanded; return; }
          details.open = true;
          const style = getComputedStyle(details);
          const collapsed = summary.getBoundingClientRect().height + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
          const to = expanded ? details.getBoundingClientRect().height : collapsed;
          animation = details.animate({ height: [from + "px", to + "px"] }, { duration: 280, easing: "cubic-bezier(.22,1,.36,1)" });
          animation.onfinish = () => { details.open = expanded; animation = undefined; };
        });
      });

      /* Constelação de partículas (estilo Dala) — campo de triângulos cromáticos */
      (() => {
        const canvases = document.querySelectorAll(".dala-constellation");
        if (!canvases.length) return;
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const palette = ["#8052ff", "#ffb829", "#15846e", "#6366f1", "#c026d3", "#2563eb"];

        const initCanvas = (canvas) => {
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          let w = 0, h = 0, dpr = 1, particles = [];

          const build = () => {
            particles = [];
            const cx = w * 0.5, cy = h * 0.5;
            // Núcleo: nuvem orgânica densa (forma de "cérebro")
            const core = Math.round(Math.min(150, (w * h) / 7000));
            for (let i = 0; i < core; i++) {
              const a = Math.random() * Math.PI * 2;
              const r = Math.pow(Math.random(), 0.6);
              const rx = (w * 0.42) * r * Math.cos(a);
              const ry = (h * 0.40) * r * Math.sin(a);
              const wobble = 1 + 0.18 * Math.sin(a * 3 + r * 4);
              particles.push({
                x: cx + rx * wobble, y: cy + ry * wobble,
                size: 1.5 + Math.random() * 3,
                color: palette[(Math.random() * palette.length) | 0],
                rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 0.004,
                vx: (Math.random() - 0.5) * 0.12, vy: (Math.random() - 0.5) * 0.12,
                alpha: 0.35 + Math.random() * 0.5,
              });
            }
            // Ambiente: partículas esparsas pelo canvas
            const ambient = Math.round(Math.min(90, (w * h) / 14000));
            for (let i = 0; i < ambient; i++) {
              particles.push({
                x: Math.random() * w, y: Math.random() * h,
                size: 1 + Math.random() * 2.2,
                color: palette[(Math.random() * palette.length) | 0],
                rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 0.003,
                vx: (Math.random() - 0.5) * 0.06, vy: (Math.random() - 0.5) * 0.06,
                alpha: 0.15 + Math.random() * 0.3,
              });
            }
          };

          const drawTri = (p) => {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.globalAlpha = p.alpha;
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 1;
            const s = p.size;
            ctx.beginPath();
            ctx.moveTo(0, -s);
            ctx.lineTo(s * 0.866, s * 0.5);
            ctx.lineTo(-s * 0.866, s * 0.5);
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
          };

          const tick = () => {
            ctx.clearRect(0, 0, w, h);
            for (const p of particles) {
              p.x += p.vx; p.y += p.vy; p.rot += p.spin;
              if (p.x < -10) p.x = w + 10;
              if (p.x > w + 10) p.x = -10;
              if (p.y < -10) p.y = h + 10;
              if (p.y > h + 10) p.y = -10;
              drawTri(p);
            }
            if (!reduce) requestAnimationFrame(tick);
          };

          const resize = () => {
            const rect = canvas.parentElement.getBoundingClientRect();
            w = rect.width; h = rect.height;
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.floor(w * dpr);
            canvas.height = Math.floor(h * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            build();
          };

          resize();
          window.addEventListener("resize", resize);
          if (reduce) { tick(); } else { requestAnimationFrame(tick); }
        };

        canvases.forEach(initCanvas);
      })();
