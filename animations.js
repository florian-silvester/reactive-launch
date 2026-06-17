console.log('🎨 Animations.js loaded');
console.log('📍 Script URL:', document.currentScript?.src || 'inline');
console.log('📍 Current page:', window.location.href);

// The fixed/pinned-section system initializes from scroll = 0. If the browser
// restores scroll to mid-page (e.g. the footer) on refresh, ScrollTrigger and the
// fixed-section sorting compute against the wrong starting state and the whole
// stack breaks (sections scroll with their spacers, the nav/logo stays stuck at
// the footer). Disable the browser's scroll restoration and start every full load
// at the top so initialization is always clean. (This runs only on full page
// loads, not Barba transitions, since the script re-executes only on full loads.)
try {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  window.addEventListener('load', () => {
    window.scrollTo(0, 0);
    // Recompute all ScrollTrigger positions once images/fonts have settled.
    if (typeof ScrollTrigger !== 'undefined') {
      try { ScrollTrigger.refresh(); } catch (e) {}
    }
  });
} catch (e) {}

const AUTO_SCROLL_SPEED_PX_PER_SEC = 60; // fixed speed for auto-scroll (25% slower)

// Load GSAP ScrollToPlugin if not already loaded
function loadScrollToPlugin() {
  return new Promise((resolve, reject) => {
    if (typeof gsap !== 'undefined' && gsap.plugins && gsap.plugins.scrollTo) {
      console.log('✅ ScrollToPlugin already loaded');
      resolve();
      return;
    }
    
    console.log('📦 Loading GSAP ScrollToPlugin...');
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollToPlugin.min.js';
    script.onload = () => {
      if (typeof gsap !== 'undefined') {
        gsap.registerPlugin(ScrollToPlugin);
        console.log('✅ ScrollToPlugin loaded and registered');
        resolve();
      } else {
        reject('GSAP not found after loading plugin');
      }
    };
    script.onerror = () => reject('Failed to load ScrollToPlugin');
    document.head.appendChild(script);
  });
}

if (!window.barbaInitialized) {
  window.barbaInitialized = true;

  document.addEventListener('DOMContentLoaded', async () => {
    console.log('📄 DOM Content Loaded');
    console.log('🔍 Checking dependencies:', {
      barba: typeof barba !== 'undefined',
      gsap: typeof gsap !== 'undefined'
    });
    
  if (typeof barba === 'undefined' || typeof gsap === 'undefined') {
      console.error('❌ Missing barba or gsap');
      console.error('   Barba:', typeof barba);
      console.error('   GSAP:', typeof gsap);
      return;
    }
    
    // Load ScrollToPlugin
    try {
      await loadScrollToPlugin();
    } catch (error) {
      console.error('❌ Failed to load ScrollToPlugin:', error);
      console.log('⚠️ Falling back to manual scroll (may be less smooth)');
    }

    // Init transition-1 cover system
    initTransition1();

    // Auto-scroll state
    let autoScrollTween = null;
    let userScrollTimeout = null;
    let isUserScrolling = false;
    let isAutoScrolling = false; // Track if GSAP is currently scrolling
    let autoScrollEnabled = true; // Allow user to take control
    let startScrollPosition = 0;
    let targetScrollPosition = 0;
    let lastScrollTime = 0;
    let lastScrollPosition = window.scrollY;

    // Smooth scroll state
    let smoothScrollTween = null;
    let smoothScrollEnabled = false;

    function initSmoothScroll() {
      if (smoothScrollEnabled) return;
      if (!(gsap && gsap.plugins && gsap.plugins.scrollTo)) {
        console.warn('⚠️ Smooth scroll requires ScrollToPlugin');
        return;
      }
      smoothScrollEnabled = true;
      let targetY = window.scrollY;

      const onWheel = (event) => {
        if (!smoothScrollEnabled) return;
        event.preventDefault();
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        targetY = Math.max(0, Math.min(maxScroll, targetY + event.deltaY));
        if (smoothScrollTween) smoothScrollTween.kill();
        smoothScrollTween = gsap.to(window, {
          scrollTo: { y: targetY, autoKill: false },
          // duration 0.25 (was 0.6) + power2.out (was power3.out): the wheel is
          // hijacked and re-animated, so a long, hard-decelerating tween read as
          // the page "resisting" the scroll. A shorter, gentler ease keeps a hint
          // of smoothing without fighting the user's input.
          duration: 0.25,
          ease: 'power2.out',
          overwrite: 'auto'
        });
      };

      window.addEventListener('wheel', onWheel, { passive: false });
    }

    function pauseAutoScrollTemporarily() {
      if (!autoScrollTween || !isAutoScrolling) return;
      isUserScrolling = true;
      autoScrollTween.pause();
      isAutoScrolling = false;
      console.log('⏸️ Auto-scroll paused (user scrolling)');
    }

    function pauseAutoScroll() {
      if (autoScrollTween && autoScrollTween.isActive()) {
        autoScrollTween.pause();
        isAutoScrolling = false;
        console.log('⏸️ Auto-scroll paused (user scrolling)');
      }
    }

    function resumeAutoScroll() {
      if (autoScrollTween && !autoScrollTween.isActive() && !isUserScrolling) {
        const currentScroll = window.scrollY;
        const remainingDistance = targetScrollPosition - currentScroll;
        const remainingDuration = remainingDistance / AUTO_SCROLL_SPEED_PX_PER_SEC;
        
        if (remainingDistance > 0 && remainingDuration > 0) {
          // Use ScrollToPlugin if available
          if (gsap.plugins && gsap.plugins.scrollTo) {
            isAutoScrolling = true;
            autoScrollTween = gsap.to(window, {
              scrollTo: { y: targetScrollPosition, autoKill: false },
              duration: remainingDuration,
              ease: "none",
              onComplete: () => {
                isAutoScrolling = false;
                console.log('✅ Auto-scroll complete');
              }
            });
          } else {
            // Fallback
            const scrollProxy = { scroll: currentScroll };
            autoScrollTween = gsap.to(scrollProxy, {
              scroll: targetScrollPosition,
              duration: remainingDuration,
              ease: "none",
              onUpdate: () => {
                if (!isUserScrolling) {
                  window.scrollTo(0, scrollProxy.scroll);
                }
              },
              onComplete: () => {
                console.log('✅ Auto-scroll complete');
              }
            });
          }
          console.log('▶️ Auto-scroll resumed');
        }
      }
    }

    function startAutoScroll() {
      if (!autoScrollEnabled) {
        console.log('ℹ️ Auto-scroll disabled - user control active');
        return;
      }
      console.log('🔍 Checking if auto-scroll should start...');
      
      // Trigger only if page contains data-auto-scroll="true"
      const hasAutoScroll = !!document.querySelector('[data-auto-scroll="true"]');
      
      console.log('📍 Auto-scroll detection:', {
        hasAutoScroll,
        pathname: window.location.pathname
      });
      
      if (!hasAutoScroll) {
        console.log('❌ data-auto-scroll not found - skipping auto-scroll');
        return;
      }
      
      // Stop any existing auto-scroll
      if (autoScrollTween) {
        autoScrollTween.kill();
      }
      
      const scrollHeight = document.documentElement.scrollHeight;
      const windowHeight = window.innerHeight;
      const maxScroll = scrollHeight - windowHeight;
      
      console.log('📏 Scroll check:', {
        scrollHeight,
        windowHeight,
        maxScroll,
        currentScroll: window.scrollY
      });
      
      if (maxScroll <= 0) {
        console.log('❌ Page doesn\'t scroll (maxScroll <= 0)');
    return;
  }

      const distance = Math.max(0, maxScroll - window.scrollY);
      const duration = distance / AUTO_SCROLL_SPEED_PX_PER_SEC;
      console.log('🔄 Starting auto-scroll on homepage');
      console.log(`   Will scroll ${Math.round(distance)}px at ${AUTO_SCROLL_SPEED_PX_PER_SEC}px/s (${duration.toFixed(1)}s)`);
      
      // Store start and target positions
      startScrollPosition = window.scrollY;
      targetScrollPosition = maxScroll;
      
      // Use GSAP ScrollToPlugin for smooth scrolling
      if (gsap.plugins && gsap.plugins.scrollTo) {
        console.log('✨ Using ScrollToPlugin for smooth auto-scroll');
        isAutoScrolling = true;
        autoScrollTween = gsap.to(window, {
          scrollTo: { y: maxScroll, autoKill: false },
          duration,
          ease: "none",
          onStart: () => {
            isAutoScrolling = true;
            console.log('✨ Auto-scroll animation started!');
          },
          onComplete: () => {
            isAutoScrolling = false;
            console.log('✅ Auto-scroll complete');
          }
        });
      } else {
        // Fallback to manual scroll
        const scrollProxy = { scroll: window.scrollY };
        autoScrollTween = gsap.to(scrollProxy, {
          scroll: maxScroll,
          duration,
          ease: "none",
          onUpdate: () => {
            if (!isUserScrolling) {
              window.scrollTo(0, scrollProxy.scroll);
            }
          },
          onStart: () => {
            console.log('✨ Auto-scroll animation started!');
          },
          onComplete: () => {
            console.log('✅ Auto-scroll complete');
          }
        });
      }
    }

    function stopAutoScroll() {
      if (autoScrollTween) {
        autoScrollTween.kill();
        autoScrollTween = null;
        console.log('⏸️ Auto-scroll stopped');
      }
    }

    // Handle user scrolling - pause auto-scroll, then resume
    function handleUserInput() {
      pauseAutoScrollTemporarily();
      if (userScrollTimeout) {
        clearTimeout(userScrollTimeout);
      }
      userScrollTimeout = setTimeout(() => {
        isUserScrolling = false;
        resumeAutoScroll();
      }, 1500);
    }
    
    // Only listen to actual user input events, NOT scroll events (which fire during GSAP scrolling)
    document.addEventListener('wheel', handleUserInput, { passive: true });
    document.addEventListener('touchstart', handleUserInput, { passive: true });
    document.addEventListener('keydown', (e) => {
      // Detect arrow keys, page up/down, spacebar
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', ' '].includes(e.key)) {
        handleUserInput();
      }
    }, { passive: true });

    barba.init({
      sync: true,
      preventRunning: true,
      
      transitions: [{
        name: 'crossfade',
        
        // With sync:true, enter runs while leave runs
        // We only need to fade out the current - next appears underneath
        leave() {
          if (hasTransition1()) {
            return playTransition1In();
          }
        },

        enter(data) {
          stopAutoScroll(); // Stop auto-scroll during transition
          if (hasTransition1()) {
            // No fade when transition-1 is present
            return;
          }
          console.log('🌅 ENTER - fading out current container');
          return gsap.to(data.current.container, { 
            opacity: 0, 
            duration: 0.5,
            ease: "power2.out"
          });
        },
        
        afterEnter(data) {
          // Reset user scrolling state on new page
          isUserScrolling = false;
          if (userScrollTimeout) {
            clearTimeout(userScrollTimeout);
            userScrollTimeout = null;
          }
          // Start auto-scroll if on homepage
          setTimeout(() => {
            startAutoScroll();
          }, 1000); // Small delay after page transition
          
          // Initialize Landing scroll opacity animation
          setTimeout(() => {
            initLandingScrollOpacity();
          }, 500);

          // Initialize Menu toggle
          setTimeout(() => {
            initializeMenuToggle();
          }, 600);

          // Initialize Marquee
          setTimeout(() => {
            initMarquee();
          }, 680);

          // Initialize Text type animation
          setTimeout(() => {
            initTextType();
          }, 690);

          // Initialize radial overlay
          setTimeout(() => {
            initRadialOverlay();
          }, 695);

          // Initialize GSAP smooth scroll (optional)
          setTimeout(() => {
            initSmoothScroll();
          }, 700);

          // Initialize LIDAR scanners
          setTimeout(() => {
            initLidarScanners();
          }, 700);

          // Initialize fixed visual section sorting
          setTimeout(() => {
            initFixedSectionSorting();
          }, 720);

          // Initialize accordion+tabs combo sections
          setTimeout(() => {
            initAccordionTabsCombo();
            initHeroTypeSequence();
            initTypeBuild();
            initBackgroundParallax();
            initHeadroomNav();
            initForceVideoAutoplay();
          }, 715);

          // Initialize scroll-triggered typing text
          setTimeout(() => {
            initScrubTypeText();
            initHeaderTypeText();
          }, 730);

          // Transition-1 exit animation after enter
          if (hasTransition1()) {
            playTransition1Out();
          }

          // Close nav/menu after transition settles
          setTimeout(() => {
            if (typeof window.closeMenu === 'function') {
              window.closeMenu();
            }
          }, 900);
        }
      }]
    });

    // Start auto-scroll on initial page load
    setTimeout(() => {
      startAutoScroll();
    }, 2000); // Wait 2 seconds after page load
    
    // Initialize Landing scroll opacity animation
    setTimeout(() => {
      initLandingScrollOpacity();
    }, 1000);

    // Initialize Menu toggle
    setTimeout(() => {
      initializeMenuToggle();
    }, 1100);

    // Initialize Marquee
    setTimeout(() => {
      initMarquee();
    }, 1180);

    // Initialize Text type animation
    setTimeout(() => {
      initTextType();
    }, 1190);

    // Initialize radial overlay
    setTimeout(() => {
      initRadialOverlay();
    }, 1195);

    // Initialize GSAP smooth scroll (optional)
    setTimeout(() => {
      initSmoothScroll();
    }, 1200);

    // Initialize LIDAR scanners
    setTimeout(() => {
      initLidarScanners();
    }, 1200);

    // Initialize fixed visual section sorting
    setTimeout(() => {
      initFixedSectionSorting();
    }, 1220);

    // Initialize scroll-triggered typing text
    setTimeout(() => {
      initScrubTypeText();
      initHeaderTypeText();
      initAccordionTabsCombo();
      initHeroTypeSequence();
      initTypeBuild();
      initBackgroundParallax();
      initHeadroomNav();
      initForceVideoAutoplay();
    }, 1230);

    // Transition-1 exit animation on initial load
    if (hasTransition1()) {
      playTransition1Out();
    }

    // Close nav/menu after initial load settles
    setTimeout(() => {
      if (typeof window.closeMenu === 'function') {
        window.closeMenu();
      }
    }, 900);

    console.log('✅ Barba ready');
    
    // Expose test function for debugging
    window.testAutoScroll = startAutoScroll;
  });
}

// Standalone auto-scroll (works without Barba)
let standaloneScrollTween = null;
let standaloneUserScrollTimeout = null;
let standaloneIsUserScrolling = false;
let standaloneIsAutoScrolling = false;
// Standalone pause/resume helpers
function pauseStandaloneAutoScroll() {
  if (!standaloneScrollTween || !standaloneIsAutoScrolling) return;
  standaloneIsUserScrolling = true;
  standaloneScrollTween.pause();
  standaloneIsAutoScrolling = false;
  console.log('⏸️ Standalone auto-scroll paused (user scrolling)');
}

function initStandaloneAutoScroll() {
  console.log('🚀 Initializing standalone auto-scroll...');
  
  if (typeof gsap === 'undefined') {
    console.error('❌ GSAP not loaded - cannot start auto-scroll');
    return;
  }
  
  const hasAutoScroll = !!document.querySelector('[data-auto-scroll="true"]');
  
  if (!hasAutoScroll) {
    console.log('ℹ️ data-auto-scroll not found - skipping auto-scroll');
    return;
  }
  
  setTimeout(() => {
    const scrollHeight = document.documentElement.scrollHeight;
    const windowHeight = window.innerHeight;
    const maxScroll = scrollHeight - windowHeight;
    
    console.log('📏 Standalone scroll check:', {
      scrollHeight,
      windowHeight,
      maxScroll,
      currentScroll: window.scrollY
    });
    
    if (maxScroll <= 0) {
      console.log('❌ Page doesn\'t scroll');
      return;
    }
    
    console.log('🔄 Starting standalone auto-scroll');
    const startPos = window.scrollY;
    const scrollDistance = Math.max(0, maxScroll - window.scrollY);
    const scrollDuration = scrollDistance / AUTO_SCROLL_SPEED_PX_PER_SEC; // fixed speed
    
    // Use GSAP ScrollToPlugin for smooth scrolling
    if (gsap.plugins && gsap.plugins.scrollTo) {
      console.log('✨ Using ScrollToPlugin for smooth auto-scroll');
      standaloneIsAutoScrolling = true;
      standaloneScrollTween = gsap.to(window, {
        scrollTo: { y: maxScroll, autoKill: false },
        duration: scrollDuration,
        ease: "none",
        onStart: () => {
          standaloneIsAutoScrolling = true;
          console.log('✨ Standalone auto-scroll started!');
          console.log(`   Scrolling ${Math.round(scrollDistance)}px at ${AUTO_SCROLL_SPEED_PX_PER_SEC}px/s (${scrollDuration.toFixed(1)}s)`);
        },
        onComplete: () => {
          standaloneIsAutoScrolling = false;
          console.log('✅ Standalone auto-scroll complete - reached bottom');
        }
      });
    } else {
      // Fallback to manual scroll (less smooth)
      console.log('⚠️ ScrollToPlugin not available, using fallback');
      const scrollProxy = { scroll: window.scrollY };
      standaloneScrollTween = gsap.to(scrollProxy, {
        scroll: maxScroll,
        duration: scrollDuration,
        ease: "none",
        onUpdate: function() {
          if (!standaloneIsUserScrolling) {
            window.scrollTo(0, scrollProxy.scroll);
          }
        },
        onComplete: () => {
          console.log('✅ Standalone auto-scroll complete - reached bottom');
        }
      });
    }
    
    // Handle user scrolling for standalone version - pause then resume
    function handleStandaloneUserInput() {
      pauseStandaloneAutoScroll();
      if (standaloneUserScrollTimeout) {
        clearTimeout(standaloneUserScrollTimeout);
      }
      standaloneUserScrollTimeout = setTimeout(() => {
        standaloneIsUserScrolling = false;
        // resume with consistent speed
        const currentScroll = window.scrollY;
        const remainingDistance = maxScroll - currentScroll;
        if (remainingDistance <= 10) return;
        const totalDistance = maxScroll - startPos;
        const remainingDuration = remainingDistance / AUTO_SCROLL_SPEED_PX_PER_SEC;
        if (gsap.plugins && gsap.plugins.scrollTo) {
          standaloneIsAutoScrolling = true;
          standaloneScrollTween = gsap.to(window, {
            scrollTo: { y: maxScroll, autoKill: false },
            duration: remainingDuration,
            ease: "none",
            onComplete: () => {
              standaloneIsAutoScrolling = false;
              console.log('✅ Standalone auto-scroll complete');
            }
          });
        }
      }, 1500);
    }
    
    // Only add listeners if not already added (avoid duplicates)
    // ONLY listen to actual user input, NOT scroll events
    if (!window.standaloneScrollListenersAdded) {
      document.addEventListener('wheel', handleStandaloneUserInput, { passive: true });
      document.addEventListener('touchstart', handleStandaloneUserInput, { passive: true });
      document.addEventListener('keydown', (e) => {
        if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', ' '].includes(e.key)) {
          handleStandaloneUserInput();
        }
      }, { passive: true });
      window.standaloneScrollListenersAdded = true;
    }
  }, 2000);
}

// ================================================================================
// 🎭 LANDING SCROLL TEXT OPACITY ANIMATION
// Targets .u-text inside [data-landing-scroll="true"]
// Opacity is 1 near viewport center, 0 when away from center
// ================================================================================

let landingScrollTweens = [];

function initLandingScrollOpacity() {
  console.log('🎭 Initializing Landing scroll text opacity animation...');
  
  if (typeof gsap === 'undefined') {
    console.error('❌ GSAP not loaded - cannot animate Landing scroll');
    return;
  }
  
  // Clean up any existing animations
  landingScrollTweens.forEach(tween => {
    if (tween && tween.kill) tween.kill();
  });
  landingScrollTweens = [];
  
  const landingSections = document.querySelectorAll('[data-landing-scroll="true"]');
  
  if (landingSections.length === 0) {
    console.log('ℹ️ No sections with data-landing-scroll="true" found');
    console.log('💡 Add Custom Attribute: data-landing-scroll = true');
    return;
  }
  
  console.log(`✅ Found ${landingSections.length} section(s) with data-landing-scroll="true"`);
  
  const textElements = [];
  landingSections.forEach((section, index) => {
    const texts = Array.from(section.querySelectorAll('.u-text'));
    if (texts.length === 0) {
      console.log(`   ⚠️ Section ${index + 1}: no .u-text found`);
      return;
    }
    console.log(`   ✅ Section ${index + 1}: ${texts.length} .u-text elements`);
    textElements.push(...texts);
  });
  
  if (textElements.length === 0) {
    console.log('ℹ️ No .u-text elements found inside data-landing-scroll sections');
    return;
  }
  
  // Set initial opacity to 0 (hidden away from center)
  gsap.set(textElements, { opacity: 0 });
  
  function updateOpacity() {
    const viewportCenter = window.innerHeight * 0.5;
    const innerDistance = window.innerHeight * 0.01; // very tight full-opacity zone
    const outerDistance = window.innerHeight * 0.04; // keep dropoff range
    
    textElements.forEach(el => {
      const rect = el.getBoundingClientRect();
      const elCenter = rect.top + rect.height * 0.5;
      const distance = Math.abs(elCenter - viewportCenter);
      
      // Smooth range-based opacity (no single-word highlight)
      let opacity;
      if (distance <= innerDistance) {
        opacity = 1;
      } else if (distance >= outerDistance) {
        opacity = 0;
      } else {
        const t = (distance - innerDistance) / (outerDistance - innerDistance);
        // Softer curve for approximation feel
        const smooth = t * t * (3 - 2 * t);
        opacity = 1 - smooth;
      }
      
      gsap.to(el, {
        opacity,
        duration: 0.12,
        ease: "power1.out",
        overwrite: true
      });
    });
  }
  
  // Shared scroll listener
  let rafId = null;
  function handleScroll() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      updateOpacity();
      rafId = null;
    });
  }
  
  // Initial update
  updateOpacity();
  window.addEventListener('scroll', handleScroll, { passive: true });
  window.addEventListener('resize', handleScroll, { passive: true });
  
  landingScrollTweens.push({
    kill: () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      gsap.set(textElements, { opacity: 1 });
    }
  });
  
  console.log('✅ Landing scroll text opacity animation initialized');
  
  // Manual test
  window.testLandingScroll = () => {
    console.log('🧪 Testing Landing scroll text animation...');
    gsap.to(textElements, {
      opacity: 0.2,
            duration: 0.6, 
      yoyo: true,
      repeat: 1,
      onComplete: () => gsap.set(textElements, { opacity: 1 })
    });
  };
}

// ================================================================================
// 🧭 MENU TOGGLE (data-menu / data-menu-trigger)
// ================================================================================
function initializeMenuToggle() {
  const menu = document.querySelector('[data-menu]');
  if (!menu) return;

  const originalPaddingTop = menu.dataset.menuPaddingTop || getComputedStyle(menu).paddingTop;
  const originalPaddingBottom = menu.dataset.menuPaddingBottom || getComputedStyle(menu).paddingBottom;
  menu.dataset.menuPaddingTop = originalPaddingTop;
  menu.dataset.menuPaddingBottom = originalPaddingBottom;

  const shouldStartOpen = menu.getAttribute('data-menu-open') === 'true';
  // Default hidden on page enter
  if (!shouldStartOpen) {
    gsap.set(menu, {
      autoAlpha: 0,
      height: 0,
      paddingTop: 0,
      paddingBottom: 0,
      overflow: 'hidden',
      pointerEvents: 'none',
    });
    menu.dataset.menuOpen = 'false';
  } else {
    gsap.set(menu, {
      autoAlpha: 1,
      height: 'auto',
      paddingTop: originalPaddingTop,
      paddingBottom: originalPaddingBottom,
      overflow: 'hidden',
      pointerEvents: 'auto',
    });
    menu.dataset.menuOpen = 'true';
  }

  if (window.menuToggleInitialized) return;
  window.menuToggleInitialized = true;

  const setHamburgerOpen = (open) => {
    document.querySelectorAll('[data-menu-trigger]').forEach((el) => {
      el.classList.toggle('w--open', open);
      el.querySelectorAll('.hamburger-3, [class*="hamburger"]').forEach((h) => {
        h.classList.toggle('w--open', open);
      });
    });
  };

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-menu-trigger]');
    if (!trigger) return;

    const currentMenu = document.querySelector('[data-menu]');
    if (!currentMenu) return;

    const isOpen = currentMenu.dataset.menuOpen === 'true';
    if (isOpen) {
      currentMenu.dataset.menuOpen = 'false';
      setHamburgerOpen(false);
      gsap.to(currentMenu, {
        autoAlpha: 0,
        height: 0,
        paddingTop: 0,
        paddingBottom: 0,
        duration: 0.25,
        ease: 'power2.out',
        onComplete: () => {
          currentMenu.style.pointerEvents = 'none';
        },
      });
    } else {
      currentMenu.dataset.menuOpen = 'true';
      setHamburgerOpen(true);
      currentMenu.style.pointerEvents = 'auto';
      const targetHeight = currentMenu.scrollHeight;
      const menuItemCandidates = Array.from(currentMenu.querySelectorAll('[data-menu-item]'));
      const menuItems = menuItemCandidates.length > 0
        ? menuItemCandidates
        : Array.from(currentMenu.children);
      gsap.to(currentMenu, {
        autoAlpha: 1,
        height: targetHeight,
        paddingTop: originalPaddingTop,
        paddingBottom: originalPaddingBottom,
        duration: 0.25,
        ease: 'power2.out',
        onComplete: () => {
          currentMenu.style.height = 'auto';
        },
      });
      if (menuItems.length > 0) {
        const tl = gsap.timeline();
        menuItems.forEach((item, index) => {
          tl.fromTo(
            item,
            { y: 8, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.35, ease: 'power2.out' },
            0.15 + index * 0.1
          );
        });
      }
    }
  });

  const closeMenu = () => {
    const currentMenu = document.querySelector('[data-menu]');
    if (!currentMenu) return;
    if (currentMenu.dataset.menuOpen !== 'true') return;
    currentMenu.dataset.menuOpen = 'false';
    setHamburgerOpen(false);
    gsap.to(currentMenu, {
      autoAlpha: 0,
      height: 0,
      paddingTop: 0,
      paddingBottom: 0,
      duration: 0.25,
      ease: 'power2.out',
      onComplete: () => {
        currentMenu.style.pointerEvents = 'none';
      },
    });
  };
  const closeMenuDelayed = (delay = 300) => {
    setTimeout(() => closeMenu(), delay);
  };
  window.closeMenu = closeMenu;

  // Close on scroll
  window.addEventListener('scroll', () => closeMenu(), { passive: true });

  // Close on click outside menu + trigger
  document.addEventListener('click', (event) => {
    const isTrigger = event.target.closest('[data-menu-trigger]');
    const isMenu = event.target.closest('[data-menu]');
    if (!isTrigger && !isMenu) {
      closeMenuDelayed(350);
    }
  });

  // Close on clickable_link
  document.addEventListener('click', (event) => {
    if (event.target.closest('.clickable_link')) {
      closeMenuDelayed(350);
    }
  });
}

// ================================================================================
// 🏁 MARQUEE (data-marquee="track" / data-marquee="content")
// ================================================================================
function initMarquee() {
  const tracks = Array.from(document.querySelectorAll('[data-marquee="track"]'));
  if (tracks.length === 0) return;

  if (typeof gsap === 'undefined') {
    console.warn('⚠️ GSAP not loaded - marquee disabled');
    return;
  }

  const prefersReducedMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const getEffectiveWidth = (element) => {
    if (!element) return 0;
    let current = element;
    while (current && current !== document.body) {
      const width = current.getBoundingClientRect().width;
      if (width) return width;
      current = current.parentElement;
    }
    return window.innerWidth || 0;
  };

  tracks.forEach((track) => {
    if (track.dataset.marqueeInitialized === 'true') return;
    const content = track.querySelector('[data-marquee="content"]');
    if (!content) {
      console.warn('⚠️ Marquee track missing content', track);
      return;
    }

    console.log('🧭 Marquee init', {
      track,
      content,
      trackDisplay: window.getComputedStyle(track).display,
      contentDisplay: window.getComputedStyle(content).display
    });

    const computedContentDisplay = window.getComputedStyle(content).display;
    if (computedContentDisplay === 'contents') {
      console.warn('⚠️ Marquee content is display: contents, forcing flex', content);
      content.style.display = 'flex';
      content.style.flexWrap = 'nowrap';
    }

    track.dataset.marqueeInitialized = 'true';
    if (prefersReducedMotion) return;

    const speed = parseFloat(track.dataset.marqueeSpeed) || 80;

    const setupMarquee = () => {
      const viewportWidth = getEffectiveWidth(track);
      const contentWidth = getEffectiveWidth(content);
      if (!viewportWidth || !contentWidth) {
        console.warn('⚠️ Marquee widths invalid', { viewportWidth, contentWidth, track, content });
        return;
      }

      if (track._marqueeTween) {
        track._marqueeTween.kill();
      }

      const totalDistance = viewportWidth + contentWidth;
      const startX = -contentWidth;
      const endX = viewportWidth;
      gsap.set(content, { x: startX });
      console.log('📦 Marquee setup', {
        viewportWidth,
        contentWidth,
        startX,
        endX,
        speed
      });
      const setOpacity = gsap.quickSetter(content, 'opacity');
      const updateOpacity = () => {
        const currentX = gsap.getProperty(content, 'x');
        const contentCenter = currentX + contentWidth / 2;
        const viewportCenter = viewportWidth / 2;
        if (contentCenter <= viewportCenter) {
          setOpacity(1);
          return;
        }
        const fadeDistance = Math.max(120, viewportWidth * 0.25);
        const progress = Math.min(1, (contentCenter - viewportCenter) / fadeDistance);
        setOpacity(Math.max(0, 1 - progress));
      };

      updateOpacity();
      track._marqueeTween = gsap.to(content, {
        x: endX,
        duration: totalDistance / speed,
        ease: 'none',
        repeat: -1,
        onUpdate: updateOpacity
      });
    };

    setupMarquee();

    if (!track._marqueeResizeHandler) {
      track._marqueeResizeHandler = () => {
        if (track._marqueeResizeTimer) {
          clearTimeout(track._marqueeResizeTimer);
        }
        track._marqueeResizeTimer = setTimeout(setupMarquee, 150);
      };
      window.addEventListener('resize', track._marqueeResizeHandler, { passive: true });
    }
  });
}

// ================================================================================
// ✍️ TEXT TYPE ANIMATION (data-text="type")
// ================================================================================
function initTextType() {
  const wrappers = Array.from(document.querySelectorAll('[data-text="type"]'));
  if (wrappers.length === 0) return;

  if (typeof gsap === 'undefined' || typeof TextPlugin === 'undefined') {
    console.warn('⚠️ TextPlugin not loaded - text type animation disabled');
    return;
  }

  gsap.registerPlugin(TextPlugin);

  wrappers.forEach((wrapper) => {
    if (wrapper.dataset.textTypeInitialized === 'true') return;
    const target =
      wrapper.querySelector('h1, h2, h3, h4, h5, h6, [data-text-target]') || wrapper;
    if (!target) return;

    wrapper.dataset.textTypeInitialized = 'true';

    const categoryEl = wrapper.querySelector('[data-text="category"]');
    const valueEl = wrapper.querySelector('[data-text="value"]');

    const pairs = [
      { category: 'Size', value: '2400 mm × 1700 mm' },
      { category: 'Speed', value: '80 km/h' },
      { category: 'Weight', value: '1,600 kg / armored' },
      { category: 'Range', value: '150 km plus' },
      { category: 'Payload', value: '1,200 kg plus' },
      { category: 'Climbing', value: '60 degree plus' },
      { category: 'Drivetrain', value: 'Fully electric / 400 V' },
      { category: 'Terrain', value: 'ATV / swimmable' },
      { category: 'Tracks', value: 'Rubber' },
      { category: 'Suspension', value: 'Full' },
      { category: 'Heat', value: 'Close to 0 signature' },
      { category: 'Acoustics', value: 'Close to 0 signature' }
    ];

    if (!categoryEl || !valueEl) {
      console.warn('⚠️ data-text="type" wrapper missing [data-text="category"] or [data-text="value"] — skipping');
      return;
    }

    const categoryTarget =
      categoryEl.querySelector('h1, h2, h3, h4, h5, h6, [data-text-target]') || categoryEl;
    const valueTarget =
      valueEl.querySelector('h1, h2, h3, h4, h5, h6, [data-text-target]') || valueEl;

    const normalizeText = (text) =>
      String(text || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

    categoryTarget.textContent = '';
    valueTarget.textContent = '';
    gsap.set([categoryEl, valueEl], { opacity: 1 });
    categoryTarget.style.whiteSpace = 'nowrap';
    valueTarget.style.whiteSpace = 'nowrap';

    const ensureMinHeight = (element, measureEl) => {
      if (!element || !measureEl) return;
      const currentMin = parseFloat(element.style.minHeight || '0') || 0;
      const measured = measureEl.getBoundingClientRect().height || 0;
      if (measured > currentMin) {
        element.style.minHeight = `${measured}px`;
      }
    };

    const tl = gsap.timeline({ repeat: -1 });
    tl.to({}, { duration: 0.8 });
    pairs.forEach(({ category, value }) => {
      const cleanCategory = normalizeText(category);
      const cleanValue = normalizeText(value);
      // 30% faster typing (durations ×0.7): coeff 0.02→0.014, 0.015→0.0105, floor 0.25→0.175
      const categoryDuration = Math.max(0.175, cleanCategory.length * 0.014);
      const valueDuration = Math.max(0.175, cleanValue.length * 0.0105);
      tl.to(categoryTarget, {
        text: cleanCategory,
        duration: categoryDuration,
        ease: 'steps(12)',
        onComplete: () => ensureMinHeight(categoryEl, categoryTarget)
      })
        .to(valueTarget, {
          text: cleanValue,
          duration: valueDuration,
          ease: 'steps(14)',
          onComplete: () => ensureMinHeight(valueEl, valueTarget)
        }, `-=${Math.min(0.2, categoryDuration * 0.3)}`)
        .to({}, { duration: 1.0 })
        .to([categoryEl, valueEl], { opacity: 0, duration: 0.2, ease: 'none' })
        .to([categoryEl, valueEl], { opacity: 1, duration: 0.01 });
    });
  });
}

// ================================================================================
// 🌑 RADIAL OVERLAY (data-overlay="radial")
// ================================================================================
function initRadialOverlay() {
  const overlay = document.querySelector('[data-overlay="radial"]');
  if (!overlay) return;
  if (overlay.dataset.overlayInitialized === 'true') return;
  overlay.dataset.overlayInitialized = 'true';

  // Architecture trace:
  // Input → output: pointer/timed-sweep updates targetX/Y → tick eases currentX/Y → CSS vars update gradient center.
  // Consumers: CSS radial-gradient uses --overlay-x/--overlay-y; no other functions depend on output.
  // File usage: only animations.js defines/uses initRadialOverlay.
  // Example: sweep sets targetX 15→85, targetY 50; tick updates --overlay-x/--overlay-y each frame.
  // System state: targetX/Y updated by pointer or sweep, currentX/Y eased; idle uses lastMoveTime.

  const cssText =
    'radial-gradient(circle at var(--overlay-x, 50%) var(--overlay-y, 50%), rgba(0,0,0,var(--overlay-center-alpha, 0)) 0%, rgba(0,0,0,var(--overlay-edge-alpha, 0.9)) 35%, rgba(0,0,0,var(--overlay-edge-strong-alpha, 0.95)) 60%)';
  overlay.style.backgroundImage = cssText;

  const prefersReducedMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isCoarsePointer =
    window.matchMedia && (window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches);

  let currentX = 50;
  let currentY = 50;
  let targetX = 50;
  let targetY = 50;
  const jitterSeedX = Math.random() * 1000;
  const jitterSeedY = Math.random() * 1000;
  let lastMoveTime = Date.now();
  let idleProgress = 0;

  const setX = typeof gsap !== 'undefined'
    ? gsap.quickSetter(overlay, '--overlay-x', '%')
    : (value) => overlay.style.setProperty('--overlay-x', `${value}%`);
  const setY = typeof gsap !== 'undefined'
    ? gsap.quickSetter(overlay, '--overlay-y', '%')
    : (value) => overlay.style.setProperty('--overlay-y', `${value}%`);
  const setCenterAlpha = typeof gsap !== 'undefined'
    ? gsap.quickSetter(overlay, '--overlay-center-alpha')
    : (value) => overlay.style.setProperty('--overlay-center-alpha', value);
  const setEdgeAlpha = typeof gsap !== 'undefined'
    ? gsap.quickSetter(overlay, '--overlay-edge-alpha')
    : (value) => overlay.style.setProperty('--overlay-edge-alpha', value);
  const setEdgeStrongAlpha = typeof gsap !== 'undefined'
    ? gsap.quickSetter(overlay, '--overlay-edge-strong-alpha')
    : (value) => overlay.style.setProperty('--overlay-edge-strong-alpha', value);

  setX(currentX);
  setY(currentY);
  setCenterAlpha(0);
  setEdgeAlpha(0.9);
  setEdgeStrongAlpha(0.95);

  // Desktop idle sweep state
  let desktopSweepActive = false;
  let desktopSweepStartTime = 0;
  let lastUserInputTime = Date.now();
  const DESKTOP_IDLE_DELAY = 2000; // ms before sweep starts
  const DESKTOP_SWEEP_FORWARD_MS = 3000;
  const DESKTOP_SWEEP_PAUSE_MS = 700;
  const DESKTOP_SWEEP_TOTAL_MS = (DESKTOP_SWEEP_FORWARD_MS * 2) + (DESKTOP_SWEEP_PAUSE_MS * 2);
  // Cap idle darkening so spotlight never fades to full black
  const IDLE_DARKNESS_MAX = 0.42;

  const updateTargetFromEvent = (event) => {
    const x = (event.clientX / window.innerWidth) * 100;
    const y = (event.clientY / window.innerHeight) * 100;
    targetX = Math.max(0, Math.min(100, x));
    targetY = Math.max(0, Math.min(100, y));
    lastMoveTime = Date.now();
    lastUserInputTime = Date.now();
    // Pause desktop sweep when user moves pointer
    if (desktopSweepActive) {
      desktopSweepActive = false;
    }
  };

  if (!prefersReducedMotion) {
    if (isCoarsePointer && typeof gsap !== 'undefined') {
      const sweepProxy = { x: 15, y: 50 };
      gsap.timeline({ repeat: -1 })
        .to(sweepProxy, {
          x: 85,
          duration: 3.0,
          ease: 'power1.inOut',
          onUpdate: () => {
            targetX = sweepProxy.x;
            targetY = sweepProxy.y;
            lastMoveTime = Date.now();
          }
        })
        .to({}, { duration: 0.7 })
        .to(sweepProxy, {
          x: 15,
          duration: 3.0,
          ease: 'power1.inOut',
          onUpdate: () => {
            targetX = sweepProxy.x;
            targetY = sweepProxy.y;
            lastMoveTime = Date.now();
          }
        })
        .to({}, { duration: 0.7 });
    }

    const tick = () => {
      const idleMs = Date.now() - lastMoveTime;
      const isIdle = idleMs > 200;

      // Desktop idle sweep: run automatically after 2s without user input
      if (!isCoarsePointer) {
        const userIdleMs = Date.now() - lastUserInputTime;
        if (userIdleMs > DESKTOP_IDLE_DELAY) {
          if (!desktopSweepActive) {
            desktopSweepActive = true;
            desktopSweepStartTime = Date.now();
          }
        } else if (desktopSweepActive) {
          desktopSweepActive = false;
        }

        if (desktopSweepActive) {
          const phase = (Date.now() - desktopSweepStartTime) % DESKTOP_SWEEP_TOTAL_MS;
          if (phase < DESKTOP_SWEEP_FORWARD_MS) {
            // 15 -> 85
            targetX = 15 + (70 * (phase / DESKTOP_SWEEP_FORWARD_MS));
          } else if (phase < DESKTOP_SWEEP_FORWARD_MS + DESKTOP_SWEEP_PAUSE_MS) {
            // hold at right edge
            targetX = 85;
          } else if (phase < (DESKTOP_SWEEP_FORWARD_MS * 2) + DESKTOP_SWEEP_PAUSE_MS) {
            // 85 -> 15
            const backPhase = phase - (DESKTOP_SWEEP_FORWARD_MS + DESKTOP_SWEEP_PAUSE_MS);
            targetX = 85 - (70 * (backPhase / DESKTOP_SWEEP_FORWARD_MS));
          } else {
            // hold at left edge
            targetX = 15;
          }
          targetY = 50;
          // Keep overlay lit while synthetic sweep is active
          lastMoveTime = Date.now();
        }
      }

      if (isIdle && !desktopSweepActive) {
        idleProgress = Math.min(IDLE_DARKNESS_MAX, idleProgress + 0.03);
      } else {
        idleProgress = Math.max(0, idleProgress - 0.12);
      }

      setCenterAlpha(idleProgress);
      setEdgeAlpha(0.9 + 0.1 * idleProgress);
      setEdgeStrongAlpha(0.95 + 0.05 * idleProgress);

      const time = Date.now() / 1000;
      const jitterAmount = 0.6;
      const jitterX =
        (Math.sin(time * 1.7 + jitterSeedX) + Math.sin(time * 0.9 + jitterSeedX * 0.7)) *
        jitterAmount;
      const jitterY =
        (Math.sin(time * 1.3 + jitterSeedY) + Math.sin(time * 0.8 + jitterSeedY * 0.6)) *
        jitterAmount;
      const ease = 0.1 + Math.abs(Math.sin(time * 0.6)) * 0.06;
      currentX += (targetX - currentX) * ease;
      currentY += (targetY - currentY) * ease;
      setX(currentX + jitterX);
      setY(currentY + jitterY);
    };

    if (typeof gsap !== 'undefined') {
      gsap.ticker.add(tick);
    } else {
      const rafTick = () => {
        tick();
        requestAnimationFrame(rafTick);
      };
      requestAnimationFrame(rafTick);
    }

    window.addEventListener('pointermove', updateTargetFromEvent, { passive: true });
    window.addEventListener('touchmove', (event) => {
      if (!event.touches || !event.touches[0]) return;
      updateTargetFromEvent(event.touches[0]);
    }, { passive: true });
  }
}

// ================================================================================
// 🎬 TRANSITION-1 PAGE COVER
// ================================================================================
function initTransition1() {
  const components = Array.from(document.querySelectorAll('.transition-1_component'));
  if (components.length === 0) return;

  if (!sessionStorage.getItem('transition-1-first-visit')) {
    sessionStorage.setItem('transition-1-first-visit', 'viewed');
    document.documentElement.classList.add('transition-1-first-visit');
    // Remove after first paint so transitions work after initial load
    setTimeout(() => {
      document.documentElement.classList.remove('transition-1-first-visit');
    }, 0);
  }
}

function hasTransition1() {
  return document.querySelector('.transition-1_component');
}

function playTransition1In() {
  const components = Array.from(document.querySelectorAll('.transition-1_component'));
  if (components.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    let remaining = components.length;
    components.forEach((component) => {
      gsap.context(() => {
        const tl = gsap.timeline({
          onComplete: () => {
            remaining -= 1;
            if (remaining <= 0) resolve();
          }
        });
        tl.set(component, { display: 'flex' });
        tl.fromTo(
          '.transition-1_column',
          { yPercent: 100 },
          { yPercent: 0, duration: 0.3, ease: 'power1.inOut', stagger: { each: 0.1, from: 'start' } }
        );
      }, component);
    });
  });
}

function playTransition1Out() {
  const components = Array.from(document.querySelectorAll('.transition-1_component'));
  if (components.length === 0) return;
  gsap.context(() => {
    components.forEach((component) => {
      const tl = gsap.timeline();
      tl.set(component, { display: 'flex' });
      tl.to('.transition-1_column', {
        yPercent: -100,
        duration: 0.3,
        ease: 'power1.inOut',
        stagger: { each: 0.1, from: 'start' },
        onComplete: () => {
          component.style.display = 'none';
        }
      });
    });
  });
}

// ================================================================================
// 🛰️ LIDAR LANDSCAPE SCANNER (mount into [data-lidar="true"])
// ================================================================================

let lidarInitialized = false;

function loadThreeJs() {
  return new Promise((resolve, reject) => {
    if (typeof THREE !== 'undefined') {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    script.onload = () => {
      if (typeof THREE !== 'undefined') {
        resolve();
      } else {
        reject('THREE not found after load');
      }
    };
    script.onerror = () => reject('Failed to load THREE.js');
    document.head.appendChild(script);
  });
}

function injectLidarStyles() {
  if (document.getElementById('lidar-scanner-styles')) return;
  const style = document.createElement('style');
  style.id = 'lidar-scanner-styles';
  style.textContent = `
    .lidar-container { position: relative; background: transparent; overflow: hidden; }
    .lidar-canvas { width: 100%; height: 100%; display: block; }
    .lidar-info {
      position: absolute; top: 12px; left: 12px; color: #00ff00;
      font-size: 12px; text-shadow: 0 0 8px #00ff00; pointer-events: none;
      z-index: 10; background: rgba(0,0,0,0.7); padding: 10px;
      border: 1px solid #00ff00; border-radius: 3px;
      font-family: 'Courier New', monospace;
    }
    .lidar-controls {
      position: absolute; bottom: 12px; left: 12px; color: #00ffff;
      font-size: 11px; background: rgba(0,0,0,0.8); padding: 10px;
      border: 1px solid #00ffff; border-radius: 4px; z-index: 10;
      font-family: 'Courier New', monospace;
    }
    .lidar-controls button {
      background: #00ffff; border: none; color: #000; padding: 6px 10px;
      margin: 4px 2px; cursor: pointer; font-weight: bold; border-radius: 3px;
      font-size: 10px; font-family: 'Courier New', monospace;
    }
    .lidar-controls button:hover { background: #00ff00; }
    .lidar-status { color: #ffff00; }
  `;
  document.head.appendChild(style);
}

async function initLidarScanners() {
  const containers = document.querySelectorAll('[data-lidar="true"]');
  if (containers.length === 0) return;

  injectLidarStyles();
  try {
    await loadThreeJs();
  } catch (err) {
    console.error('❌ LIDAR: failed to load THREE.js', err);
    return;
  }

  containers.forEach((container) => {
    if (container.dataset.lidarInitialized === 'true') {
      return;
    }
    container.dataset.lidarInitialized = 'true';

    // data-lidar often sits on a Lumos display:contents slot. Adding positioning
    // or overflow to a display:contents element forces the browser to generate a
    // box for it — which then claims a slot in the parent grid/flex and shoves
    // sibling content (e.g. overlaid text) aside. Resolve down to the first real
    // box element and mount the canvas THERE, leaving the wrapper untouched so it
    // keeps contributing nothing to layout.
    let host = container;
    while (host && window.getComputedStyle(host).display === 'contents') {
      host = host.firstElementChild;
    }
    if (!host) host = container;

    // Apply only what's needed, inline — NOT the .lidar-container class, whose
    // position:relative would clobber an existing positioning context like
    // u-cover-absolute (the intended background layer). Preserve the host's own
    // position; only establish one if it has none.
    host.style.overflow = 'hidden';
    host.style.background = 'transparent';
    if (window.getComputedStyle(host).position === 'static') {
      host.style.position = 'relative';
    }
    host.innerHTML = `
      <div class="lidar-canvas" data-canvas></div>
    `;

    const canvasHost = host.querySelector('[data-canvas]');
    const infoStatus = null;
    const infoPoints = null;
    const infoProgress = null;
    const infoAngle = null;
    const speedLabel = null;

    const zoomSource =
      container.closest('[data-lidar-zoom]') ||
      container.closest('[data-lidar-variant]') ||
      container;
    const zoomAttr = zoomSource.getAttribute('data-lidar-zoom');
    const variantAttr = zoomSource.getAttribute('data-lidar-variant');
    const isZoomed =
      (variantAttr && variantAttr.toLowerCase() === 'zoom') ||
      (zoomAttr !== null && zoomAttr.toLowerCase() !== 'false');
    const isLandscape =
      variantAttr && variantAttr.toLowerCase() === 'landscape';
    const isRings =
      variantAttr && variantAttr.toLowerCase() === 'rings';
    const isMulti =
      variantAttr && variantAttr.toLowerCase() === 'multi';
    const POINT_SIZE = isZoomed ? 0.22 : 0.12;
    const TOP_VIEW_HEIGHT = isZoomed ? 30 : 50;
    const allowDrive = (!isZoomed || isLandscape || isMulti) && !isRings;
    const HEIGHT_SCALE = isLandscape ? 0.35 : 1;
    const NUM_RINGS = 16;
    const MAX_ACCUMULATED_SCANS = 8;
    const RING_ANGLES = [];

    let scene, camera, renderer;
    let terrainPoints = [];
    let scannedPoints;
    let scanAngle = 0;
    let scanning = false;
    let scanSpeed = 0.03; // FAST by default
    let speedMode = 1;
    let totalPoints = 0;
    let visiblePoints = 0;
    let terrainSeedA = Math.random() * 1000;
    let terrainSeedB = Math.random() * 1000;
    let terrainMorph = 0;
    let viewMode = 1; // 1 = top-down default
    let scanBeam;
    const DRIVE_SPEED = 0.03; // world shift per frame (vehicle motion)
    let autoLoop = true;
    let pointAges = [];
    let ringTurns = 0;
    let accumulatedScans = [];
    let vehicleZ = 0;
    let currentScanPoints = [];

    const SCAN_RESOLUTION = 200;
    const VERTICAL_RAYS = 100;
    const MAX_RANGE = 50;
    const BEAM_THICKNESS = 0.4; // world units; rescaled per frame for fixed pixel width
    const TARGET_BEAM_PX = 1.5; // desired on-screen beam thickness in CSS pixels

    function setCamera() {
      if (viewMode === 0) {
        camera.position.set(-25, 8, 15);
        camera.lookAt(0, 3, 0);
      } else {
        camera.position.set(0, TOP_VIEW_HEIGHT, 0.1);
        camera.lookAt(0, 0, 0);
      }
      updateBeamPixelWidth();
    }

    function updateBeamPixelWidth() {
      if (!scanBeam || !camera || !renderer) return;
      const canvasHeight = renderer.domElement.clientHeight || 1;
      // Distance from camera to scanner pivot (origin) — representative for the
      // beam, which radiates from the origin out to MAX_RANGE.
      const dist = camera.position.length();
      // World units per CSS pixel at that distance, given the camera's vertical FOV.
      const worldPerPx =
        (2 * Math.tan((camera.fov * Math.PI) / 360) * dist) / canvasHeight;
      const desiredWorldThickness = TARGET_BEAM_PX * worldPerPx;
      scanBeam.scale.z = desiredWorldThickness / BEAM_THICKNESS;
    }

    function updateStatus(status) {
      // UI hidden
    }

    function updateUI() {
      const progress = Math.min(100, (scanAngle / (Math.PI * 2)) * 100);
      const degrees = Math.min(360, (scanAngle * 180 / Math.PI));
      // UI hidden
    }

    function getTerrainHeight(x, z, seed) {
      const baseScale = 0.05;
      const baseHeight = (
        Math.sin(x * baseScale + seed * 10) *
        Math.cos(z * baseScale + seed * 10) +
        Math.sin(x * baseScale * 1.7 + seed * 11) *
        Math.cos(z * baseScale * 1.7 + seed * 11) * 0.5
      ) * 3;

      const mediumScale = 0.1;
      const mediumHeight = (
        Math.sin(x * mediumScale + seed * 20) *
        Math.cos(z * mediumScale + seed * 20) +
        Math.sin(x * mediumScale * 1.5 + seed * 21) *
        Math.cos(z * mediumScale * 1.5 + seed * 21) * 0.7
      ) * 1.5;

      const detailScale = 0.3;
      const detailHeight = (
        Math.sin(x * detailScale + seed * 30) *
        Math.cos(z * detailScale + seed * 30) +
        Math.sin(x * detailScale * 2.1 + seed * 31) *
        Math.cos(z * detailScale * 2.1 + seed * 31) * 0.5
      ) * 0.4;

      const ridgeScale = 0.08;
      const ridgePattern = Math.abs(Math.sin(x * ridgeScale + z * ridgeScale * 0.7 + seed * 40));
      const ridgeHeight = Math.pow(ridgePattern, 4) * 2;

      const plateauScale = 0.06;
      const plateauNoise = Math.sin(x * plateauScale + seed * 50) * Math.cos(z * plateauScale + seed * 50);
      const plateau = plateauNoise > 0.5 ? 1 : 0;

      const valleyScale = 0.08;
      const valleyNoise = Math.sin(x * valleyScale + seed * 60) + Math.sin(z * valleyScale * 1.3 + seed * 61);
      const valley = valleyNoise < -0.7 ? valleyNoise * 0.8 : 0;

      const dist = Math.sqrt(x * x + z * z);
      const erosion = -Math.abs(Math.sin(dist * 0.1 + seed * 70)) * 0.5;
      const microDetail = (Math.sin(x * 0.7 + seed * 80) * Math.cos(z * 0.9 + seed * 81)) * 0.15;

      return (baseHeight + mediumHeight + detailHeight + ridgeHeight + plateau + valley + erosion + microDetail) * HEIGHT_SCALE;
    }

    function getTerrainHeightBlended(x, z) {
      const hA = getTerrainHeight(x, z, terrainSeedA);
      const hB = getTerrainHeight(x, z, terrainSeedB);
      return hA * (1 - terrainMorph) + hB * terrainMorph;
    }

    function getTerrainNormal(x, z) {
      const eps = 0.1;
      const h = getTerrainHeightBlended(x, z);
      const hx = getTerrainHeightBlended(x + eps, z);
      const hz = getTerrainHeightBlended(x, z + eps);
      return new THREE.Vector3(h - hx, eps, h - hz).normalize();
    }

    let objectCenters = [];
    function regenerateObjects() {
      const count = 35;
      const radius = MAX_RANGE * 0.85;
      objectCenters = new Array(count).fill(0).map(() => {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.sqrt(Math.random()) * radius;
        return {
          x: Math.cos(angle) * dist,
          z: Math.sin(angle) * dist,
          r: 1.5 + Math.random() * 2.5
        };
      });
    }

    function isObjectField(x, z) {
      for (let i = 0; i < objectCenters.length; i++) {
        const o = objectCenters[i];
        const dx = x - o.x;
        const dz = z - o.z;
        if (dx * dx + dz * dz <= o.r * o.r) {
          return true;
        }
      }
      return false;
    }

    function initRingAngles() {
      if (RING_ANGLES.length) return;
      for (let r = 0; r < NUM_RINGS; r++) {
        RING_ANGLES.push(((r / (NUM_RINGS - 1)) - 0.5) * (Math.PI / 6));
      }
    }

    function appendCurrentScanSlice() {
      for (let ring = 0; ring < NUM_RINGS; ring++) {
        const verticalAngle = RING_ANGLES[ring];
        const direction = new THREE.Vector3(
          Math.cos(verticalAngle) * Math.cos(scanAngle),
          Math.sin(verticalAngle),
          Math.cos(verticalAngle) * Math.sin(scanAngle)
        );
        const hit = raycastTerrain(direction);
        if (hit) {
          currentScanPoints.push({
            position: hit.position.clone(),
            ring
          });
        }
      }
    }

    function finalizeScanFrame() {
      accumulatedScans.push({
        points: currentScanPoints,
        vehicleZ
      });
      currentScanPoints = [];
      if (accumulatedScans.length > MAX_ACCUMULATED_SCANS) {
        accumulatedScans.shift();
      }
    }

    function updateAccumulatedScans() {
      const positions = scannedPoints.geometry.attributes.position.array;
      const colors = scannedPoints.geometry.attributes.color.array;
      const sizes = scannedPoints.geometry.attributes.size.array;
      for (let i = 0; i < sizes.length; i++) {
        sizes[i] = 0;
      }
      let pointIndex = 0;
      const maxPoints = positions.length / 3;
      for (let s = 0; s < accumulatedScans.length; s++) {
        const scan = accumulatedScans[s];
        const age = accumulatedScans.length - s - 1;
        const ageFactor = 1 - age / MAX_ACCUMULATED_SCANS;
        const zOffset = vehicleZ - scan.vehicleZ;
        for (let p = 0; p < scan.points.length && pointIndex < maxPoints; p++) {
          const pt = scan.points[p];
          const i3 = pointIndex * 3;
          positions[i3] = pt.position.x;
          positions[i3 + 1] = pt.position.y;
          positions[i3 + 2] = pt.position.z - zOffset;
          sizes[pointIndex] = POINT_SIZE * Math.max(0.2, ageFactor);
          colors[i3] = 249 / 255;
          colors[i3 + 1] = 255 / 255;
          colors[i3 + 2] = 186 / 255;
          pointIndex++;
        }
      }
      if (currentScanPoints.length > 0) {
        for (let p = 0; p < currentScanPoints.length && pointIndex < maxPoints; p++) {
          const pt = currentScanPoints[p];
          const i3 = pointIndex * 3;
          positions[i3] = pt.position.x;
          positions[i3 + 1] = pt.position.y;
          positions[i3 + 2] = pt.position.z;
          sizes[pointIndex] = POINT_SIZE;
          colors[i3] = 249 / 255;
          colors[i3 + 1] = 255 / 255;
          colors[i3 + 2] = 186 / 255;
          pointIndex++;
        }
      }
      scannedPoints.geometry.attributes.position.needsUpdate = true;
      scannedPoints.geometry.attributes.color.needsUpdate = true;
      scannedPoints.geometry.attributes.size.needsUpdate = true;
    }

    function raycastTerrain(direction) {
      for (let dist = 1; dist < MAX_RANGE; dist += 0.25) {
        const point = direction.clone().multiplyScalar(dist);
        const terrainHeight = getTerrainHeightBlended(point.x, point.z);
        if (point.y <= terrainHeight && point.y > terrainHeight - 0.25) {
          if (!isLandscape && !isRings && !isMulti && !isObjectField(point.x, point.z)) {
            return null;
          }
          return {
            position: new THREE.Vector3(point.x, terrainHeight, point.z),
            distance: dist,
            normal: getTerrainNormal(point.x, point.z)
          };
        }
      }
      return null;
    }

    function generateTerrain() {
      terrainPoints = [];
      for (let h = 0; h < SCAN_RESOLUTION; h++) {
        const horizontalAngle = (h / SCAN_RESOLUTION) * Math.PI * 2;
        const verticalHits = [];
        for (let v = 0; v < VERTICAL_RAYS; v++) {
          const verticalAngle = ((v / VERTICAL_RAYS) - 0.5) * (Math.PI / 6);
          const direction = new THREE.Vector3(
            Math.cos(verticalAngle) * Math.cos(horizontalAngle),
            Math.sin(verticalAngle),
            Math.cos(verticalAngle) * Math.sin(horizontalAngle)
          );
          const hit = raycastTerrain(direction);
          if (hit) verticalHits.push(hit);
        }
        for (let i = 0; i < verticalHits.length; i++) {
          const hit = verticalHits[i];
          let occluded = false;
          for (let j = 0; j < verticalHits.length; j++) {
            if (i !== j) {
              const otherHit = verticalHits[j];
              if (hit.distance - otherHit.distance > 5) {
                occluded = true;
                break;
              }
            }
          }
          if (!occluded) {
            const distanceFromCenter = hit.distance;
            const cullProbability = Math.max(0, 1 - (distanceFromCenter / MAX_RANGE));
            const cullStrength = isRings ? 0.05 : 0.3;
            if (Math.random() > cullProbability * cullStrength) {
              terrainPoints.push({
                position: hit.position,
                basePosition: hit.position.clone(),
                angle: horizontalAngle,
                distance: hit.distance,
                normal: hit.normal,
                revealAt: Math.floor(Math.random() * 6)
              });
            }
          }
        }
      }
      totalPoints = terrainPoints.length;
    }

    function createPointCloud() {
      if (isMulti) {
        totalPoints = SCAN_RESOLUTION * NUM_RINGS * MAX_ACCUMULATED_SCANS;
      }
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(totalPoints * 3);
      const colors = new Float32Array(totalPoints * 3);
      const sizes = new Float32Array(totalPoints);
      pointAges = new Array(totalPoints).fill(0);
      for (let i = 0; i < totalPoints; i++) {
        positions[i * 3] = 0;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = 0;
        colors[i * 3] = 0;
        colors[i * 3 + 1] = 0;
        colors[i * 3 + 2] = 0;
        sizes[i] = 0;
      }
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
      const material = new THREE.PointsMaterial({
        size: POINT_SIZE,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        sizeAttenuation: true
      });
      scannedPoints = new THREE.Points(geometry, material);
      scene.add(scannedPoints);
      visiblePoints = 0;
    }

    function createScanBeam() {
      const geometry = new THREE.PlaneGeometry(MAX_RANGE, BEAM_THICKNESS);
      // Anchor one short edge at the origin; lay flat on XZ plane pointing +X at rotation.y = 0
      geometry.translate(MAX_RANGE / 2, 0, 0);
      geometry.rotateX(-Math.PI / 2);
      const material = new THREE.MeshBasicMaterial({
        color: 0xf9ffba,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      scanBeam = new THREE.Mesh(geometry, material);
      scene.add(scanBeam);
      scanBeam.visible = false;
    }

    function updateScannedPoints() {
      if (isMulti) {
        return;
      }
      const positions = scannedPoints.geometry.attributes.position.array;
      const colors = scannedPoints.geometry.attributes.color.array;
      const sizes = scannedPoints.geometry.attributes.size.array;
      let newPoints = 0;
      const sweepWidth = isRings ? 0.02 : 0.06; // thinner sweep for rings
      
      for (let i = 0; i < terrainPoints.length; i++) {
        const point = terrainPoints[i];
        const angleDiff = (scanAngle - point.angle + Math.PI * 2) % (Math.PI * 2);
        const inSweepBand = angleDiff >= 0 && angleDiff <= sweepWidth;
        
        if (inSweepBand) {
          if (isRings && point.revealAt && ringTurns < point.revealAt) {
            continue;
          }
          const i3 = i * 3;
          positions[i3] = point.position.x;
          positions[i3 + 1] = point.position.y;
          positions[i3 + 2] = point.position.z;
          colors[i3] = 249/255;
          colors[i3 + 1] = 255/255;
          colors[i3 + 2] = 186/255;
          sizes[i] = POINT_SIZE;
          pointAges[i] = scanAngle;
          if (sizes[i] === 0) {
            visiblePoints++;
          }
          newPoints++;
        }
      }
      if (newPoints > 0) {
        scannedPoints.geometry.attributes.position.needsUpdate = true;
        scannedPoints.geometry.attributes.color.needsUpdate = true;
        scannedPoints.geometry.attributes.size.needsUpdate = true;
      }
    }

    function fadePoints() {
      if (isMulti) {
        return;
      }
      const sizes = scannedPoints.geometry.attributes.size.array;
      const colors = scannedPoints.geometry.attributes.color.array;
      let needsUpdate = false;
      const fadeStartAngle = 0;
      const fadeDuration = isRings ? Math.PI * 6 : Math.PI * 4;
      const minFadeFactor = isRings ? 0.7 : 0.35;
      for (let i = 0; i < pointAges.length; i++) {
        if (sizes[i] > 0) {
                    // Wrap age across loop to ensure smooth fading
                    const age = (scanAngle - pointAges[i] + Math.PI * 2) % (Math.PI * 2);
          if (age > fadeStartAngle) {
            const fadeProgress = (age - fadeStartAngle) / fadeDuration;
            const fadeFactor = Math.max(minFadeFactor, Math.pow(1 - fadeProgress, 2.5));
            sizes[i] = POINT_SIZE * fadeFactor;
            const i3 = i * 3;
            // Keep points yellow while fading (avoid dark trailing dots)
            colors[i3] = 249/255;
            colors[i3 + 1] = 255/255;
            colors[i3 + 2] = 186/255;
            needsUpdate = true;
            if (!isRings && (fadeFactor < 0.01 || age > fadeDuration)) {
              sizes[i] = 0;
            }
          }
        }
      }
      if (needsUpdate) {
        scannedPoints.geometry.attributes.size.needsUpdate = true;
        scannedPoints.geometry.attributes.color.needsUpdate = true;
      }
    }

    function clearPointCloud() {
      const positions = scannedPoints.geometry.attributes.position.array;
      const colors = scannedPoints.geometry.attributes.color.array;
      const sizes = scannedPoints.geometry.attributes.size.array;
      for (let i = 0; i < sizes.length; i++) {
        sizes[i] = 0;
        positions[i * 3] = 0;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = 0;
        colors[i * 3] = 0;
        colors[i * 3 + 1] = 0;
        colors[i * 3 + 2] = 0;
        pointAges[i] = 0;
      }
      scannedPoints.geometry.attributes.position.needsUpdate = true;
      scannedPoints.geometry.attributes.color.needsUpdate = true;
      scannedPoints.geometry.attributes.size.needsUpdate = true;
    }

    let morphTick = 0;

    function morphTerrainPoints() {
      // Update heights only to keep point count stable
      for (let i = 0; i < terrainPoints.length; i++) {
        const p = terrainPoints[i];
        const base = p.basePosition || p.position;
        const warpScale = 3.5;
        const warpAX = Math.sin(base.z * 0.12 + terrainSeedA * 2.7) * warpScale;
        const warpAZ = Math.cos(base.x * 0.12 + terrainSeedA * 3.1) * warpScale;
        const warpBX = Math.sin(base.z * 0.12 + terrainSeedB * 2.7) * warpScale;
        const warpBZ = Math.cos(base.x * 0.12 + terrainSeedB * 3.1) * warpScale;
        const warpX = warpAX * (1 - terrainMorph) + warpBX * terrainMorph;
        const warpZ = warpAZ * (1 - terrainMorph) + warpBZ * terrainMorph;
        p.position.x = base.x + warpX;
        p.position.z = base.z + warpZ;
        p.position.y = getTerrainHeightBlended(p.position.x, p.position.z);
        p.normal = getTerrainNormal(p.position.x, p.position.z);
      }
    }

    function animate() {
      requestAnimationFrame(animate);
      if (scanning) {
        scanAngle += scanSpeed;
        if (isMulti) {
          if (allowDrive) {
            vehicleZ += DRIVE_SPEED;
          }
          scanBeam.rotation.y = -scanAngle;
          scanBeam.visible = true;
          appendCurrentScanSlice();
          if (scanAngle >= Math.PI * 2) {
            finalizeScanFrame();
            scanAngle -= Math.PI * 2;
          }
          updateAccumulatedScans();
          updateUI();
        } else {
          if (!isRings) {
          // Smoothly morph between two different terrains every 2 sweeps
          terrainMorph += scanSpeed / (Math.PI * 2 * 2);
          if (terrainMorph >= 1) {
            terrainMorph -= 1;
            terrainSeedA = terrainSeedB;
            terrainSeedB = Math.random() * 1000;
            regenerateObjects();
          }
          }
          // Throttle morph updates for performance
          morphTick += 1;
          if (!isRings && morphTick % 3 === 0) {
            morphTerrainPoints();
          }
          scanBeam.rotation.y = -scanAngle;
          scanBeam.visible = true;
          updateScannedPoints();
          fadePoints();
          // Move existing point cloud downward to simulate forward motion
          const cloudPositions = scannedPoints.geometry.attributes.position.array;
          const sizes = scannedPoints.geometry.attributes.size.array;
          const OUTWARD_DRIFT = (isRings || isMulti) ? 0 : 0.05;
          for (let i = 0; i < sizes.length; i++) {
            if (sizes[i] > 0) {
              const i3 = i * 3;
              const x = cloudPositions[i3];
              const z = cloudPositions[i3 + 2];
              const len = Math.hypot(x, z) || 1;
              // Radial drift away from center
              cloudPositions[i3] = x + (x / len) * OUTWARD_DRIFT;
              cloudPositions[i3 + 2] = z + (z / len) * OUTWARD_DRIFT;
              if (allowDrive) {
                cloudPositions[i3 + 2] += DRIVE_SPEED;
              }
            }
          }
          scannedPoints.geometry.attributes.position.needsUpdate = true;
          if (scanAngle >= Math.PI * 2) {
            if (autoLoop) {
              // Continuous loop with slow morph, no hard reset
              scanAngle -= Math.PI * 2;
              if (isRings) {
                ringTurns += 1;
              }
              for (let i = 0; i < pointAges.length; i++) {
                pointAges[i] -= Math.PI * 2;
              }
              updateStatus('SCANNING...');
            } else {
              scanning = false;
              scanAngle = Math.PI * 2;
              scanBeam.visible = false;
              updateStatus('SCAN COMPLETE');
            }
          }
          updateUI();
        }
      }
      renderer.render(scene, camera);
    }

    function init() {
      scene = new THREE.Scene();
      // fog disabled for transparent background
      camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
      setCamera();
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      canvasHost.appendChild(renderer.domElement);
      regenerateObjects();
      if (isMulti) {
        initRingAngles();
        accumulatedScans = [];
        vehicleZ = 0;
      }

      const resize = () => {
        const width = canvasHost.clientWidth;
        const height = canvasHost.clientHeight;
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        updateBeamPixelWidth();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(canvasHost);

      if (!isMulti) {
        generateTerrain();
      }
      createPointCloud();
      createScanBeam();
      updateBeamPixelWidth();
      updateStatus('READY');
      animate();
      setTimeout(startScan, 500);
    }

    function startScan() {
      if (!scanning) {
        if (scanAngle >= Math.PI * 2) resetScan();
        scanning = true;
        autoLoop = true;
        updateStatus('SCANNING...');
      }
    }

    function pauseScan() {
      scanning = false;
      autoLoop = false;
      updateStatus('PAUSED');
    }

    function resetScan() {
      scanning = false;
      autoLoop = false;
      scanAngle = 0;
      visiblePoints = 0;
      if (isMulti) {
        accumulatedScans = [];
        currentScanPoints = [];
        vehicleZ = 0;
      }
      clearPointCloud();
      scanBeam.visible = false;
      updateStatus('READY');
      updateUI();
    }

    function changeSpeed() {
      speedMode = (speedMode + 1) % 3;
      const speeds = [0.01, 0.03, 0.06];
      scanSpeed = speeds[speedMode];
    }

    function changeTerrain() {
      terrainSeed = Math.random();
      generateTerrain();
      resetScan();
      scene.remove(scannedPoints);
      createPointCloud();
    }

    function toggleView() {
      viewMode = (viewMode + 1) % 2;
      setCamera();
    }

    // No UI controls when hidden

    init();
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Hero Animation — staged scroll scene (Webflow page "/hero-animation")
//
// Targets — matches the published DOM from the new clean rebuild:
//   [data-scene="ground-autonomy"]   the scene wrapper (.hero_wrap)
//   .hero_outer                       outer scroll-length container (sticky pin via CSS)
//   [data-scene-titles]               title/subtitle overlay (fades out stage 1)
//   .hero_grid                        the 5-cell grid
//   .hero_cell_outer                  each of the 5 cells
//   #hero                             the central cell — starts at viewport-cover scale
//   .hero_cell_wrap                   image+overlay+border container (the "media")
//   .hero_cell_label_wrap             top mono label (reveals in stage 2)
//   .hero_cell_title_wrap             bottom name (reveals in stage 2)
//   .hero_cell_pointer                optional border strip (kept hidden)
// ─────────────────────────────────────────────────────────────────────────

function loadScrollTriggerOnce() {
  return new Promise((resolve, reject) => {
    if (typeof gsap === 'undefined') { reject('GSAP not loaded'); return; }
    if (typeof ScrollTrigger !== 'undefined') {
      gsap.registerPlugin(ScrollTrigger);
      // Ignore the mobile address-bar show/hide (it changes innerHeight on every
      // scroll frame, which otherwise refreshes ScrollTrigger constantly → jitter).
      try { ScrollTrigger.config({ ignoreMobileResize: true }); } catch (e) {}
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js';
    s.onload = () => {
      if (typeof ScrollTrigger !== 'undefined') {
        gsap.registerPlugin(ScrollTrigger);
        try { ScrollTrigger.config({ ignoreMobileResize: true }); } catch (e) {}
        console.log('✅ ScrollTrigger loaded and registered');
        resolve();
      } else reject('ScrollTrigger missing after load');
    };
    s.onerror = () => reject('Failed to load ScrollTrigger');
    document.head.appendChild(s);
  });
}

function loadTextPluginOnce() {
  return new Promise((resolve, reject) => {
    if (typeof gsap === 'undefined') { reject('GSAP not loaded'); return; }
    const getPlugin = () => window.TextPlugin || window.gsap?.plugins?.TextPlugin;
    const existingPlugin = getPlugin();
    if (existingPlugin) {
      gsap.registerPlugin(existingPlugin);
      resolve();
      return;
    }

    const version = gsap.version || '3.13.0';
    const sources = [
      `https://cdnjs.cloudflare.com/ajax/libs/gsap/${version}/TextPlugin.min.js`,
      'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.13.0/TextPlugin.min.js',
      `https://cdn.jsdelivr.net/npm/gsap@${version}/dist/TextPlugin.min.js`,
      'https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/TextPlugin.min.js'
    ];
    let sourceIndex = 0;

    const tryNextSource = () => {
      const src = sources[sourceIndex];
      sourceIndex += 1;
      if (!src) {
        reject('Failed to load TextPlugin');
        return;
      }

      const s = document.createElement('script');
      s.src = src;
      s.onload = () => {
        const plugin = getPlugin();
        if (plugin) {
          gsap.registerPlugin(plugin);
          console.log('✅ TextPlugin loaded and registered');
          resolve();
        } else {
          tryNextSource();
        }
      };
      s.onerror = tryNextSource;
      document.head.appendChild(s);
    };

    tryNextSource();
  });
}

function loadSplitTextOnce() {
  return new Promise((resolve, reject) => {
    if (typeof gsap === 'undefined') { reject('GSAP not loaded'); return; }
    const getPlugin = () => window.SplitText || window.gsap?.plugins?.SplitText;
    const existing = getPlugin();
    if (existing) {
      gsap.registerPlugin(existing);
      resolve();
      return;
    }

    const version = gsap.version || '3.13.0';
    const sources = [
      `https://cdnjs.cloudflare.com/ajax/libs/gsap/${version}/SplitText.min.js`,
      'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.13.0/SplitText.min.js',
      `https://cdn.jsdelivr.net/npm/gsap@${version}/dist/SplitText.min.js`,
      'https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/SplitText.min.js'
    ];
    let sourceIndex = 0;

    const tryNextSource = () => {
      const src = sources[sourceIndex];
      sourceIndex += 1;
      if (!src) {
        reject('Failed to load SplitText');
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => {
        const plugin = getPlugin();
        if (plugin) {
          gsap.registerPlugin(plugin);
          console.log('✅ SplitText loaded and registered');
          resolve();
        } else {
          tryNextSource();
        }
      };
      s.onerror = tryNextSource;
      document.head.appendChild(s);
    };

    tryNextSource();
  });
}

function injectHeroScrollGuardStyles() {
  if (document.getElementById('hero-scroll-guard-styles')) return;
  const style = document.createElement('style');
  style.id = 'hero-scroll-guard-styles';
  style.textContent = `
    html:has([data-scene="ground-autonomy"]),
    body:has([data-scene="ground-autonomy"]) {
      overscroll-behavior-y: none;
      background-color: var(--swatch--dark-950);
    }
    [data-scene="ground-autonomy"],
    .hero_outer:has([data-scene="ground-autonomy"]) {
      background-color: var(--swatch--dark-950);
    }
    [data-scene="ground-autonomy"]:not([data-hero-ready="true"]) .hero_grid,
    [data-scene="ground-autonomy"]:not([data-hero-ready="true"]) [data-scene-titles] {
      opacity: 0;
      visibility: hidden;
    }
  `;
  document.head.appendChild(style);
}

function initFixedSectionSorting() {
  const allowedSections = ['hero', 'quote', 'footer'];
  const allowedSectionSet = new Set(allowedSections);
  const fixedSections = [];
  const sectionByName = new Map();

  Array.from(document.querySelectorAll('[data-section]')).forEach((root) => {
    const name = (root.getAttribute('data-section') || '').trim().toLowerCase();
    if (!allowedSectionSet.has(name) || sectionByName.has(name)) return;

    const rootStyles = window.getComputedStyle(root);
    const visual = rootStyles.display === 'contents'
      ? (root.firstElementChild || root)
      : root;
    const section = { name, root, visual };
    fixedSections.push(section);
    sectionByName.set(name, section);
  });

  fixedSections.sort((a, b) => allowedSections.indexOf(a.name) - allowedSections.indexOf(b.name));

  if (fixedSections.length < 2) return;

  // The stylesheet sets `body { background: #fff }`, and the dark theme color is a
  // CSS var only defined on .page_wrap — so html/body fall back to WHITE. On
  // mobile the fixed sections don't cover the dynamic-viewport edges, exposing
  // that white. Pin html+body to the sections' actual computed dark color (a
  // resolved value applied inline beats the #fff rule and matches seamlessly).
  try {
    const sampleVisual = fixedSections[0].visual || fixedSections[0].root;
    let dark = window.getComputedStyle(sampleVisual).backgroundColor;
    if (!dark || /rgba?\(0,\s*0,\s*0,\s*0\)|transparent/.test(dark)) {
      const pw = document.querySelector('.page_wrap');
      dark = pw ? window.getComputedStyle(pw).backgroundColor : '';
    }
    if (!dark || /rgba?\(0,\s*0,\s*0,\s*0\)|transparent/.test(dark)) dark = '#0a0a0a';
    document.documentElement.style.backgroundColor = dark;
    document.body.style.backgroundColor = dark;
  } catch (e) {}

  const runId = (window.fixedSectionSortingRunId || 0) + 1;
  window.fixedSectionSortingRunId = runId;

  if (window.fixedSectionSortingState) {
    const oldState = window.fixedSectionSortingState;
    oldState.triggers?.forEach((trigger) => trigger.kill());
    oldState.parallaxTweens?.forEach((tween) => tween.kill());
    if (oldState.onScroll) window.removeEventListener('scroll', oldState.onScroll);
    if (oldState.onResize) window.removeEventListener('resize', oldState.onResize);
  }

  const getTriggerName = (element) => {
    const rawValue =
      element.getAttribute('data-fixed-trigger') ||
      element.getAttribute('data-section-trigger') ||
      element.getAttribute('data-section-spacer') ||
      element.getAttribute('data-section-scroll') ||
      '';
    return rawValue.trim().toLowerCase();
  };

  const triggerRecords = Array.from(document.querySelectorAll(
    '[data-fixed-trigger], [data-section-trigger], [data-section-spacer], [data-section-scroll]'
  ))
    .map((element) => ({ element, name: getTriggerName(element) }))
    .filter((record) => sectionByName.has(record.name));

  const state = {
    triggers: [],
    parallaxTweens: [],
    parallaxOffsets: new Map(),
    activeName: null,
    onScroll: null,
    onResize: null
  };
  window.fixedSectionSortingState = state;

  const getParallaxOffset = (panel) => state.parallaxOffsets.get(panel.name) || 0;
  const isHeroParallaxLocked = (panel) => {
    return panel.name === 'hero' && window.heroFullscreenParallaxLock === true;
  };

  const setPanelParallaxOffset = (panel, y, forceApply = false) => {
    const heroParallaxLocked = isHeroParallaxLocked(panel);
    const nextY = isHeroParallaxLocked(panel) ? 0 : y;
    state.parallaxOffsets.set(panel.name, nextY);
    if (typeof gsap !== 'undefined' && (forceApply || state.activeName === panel.name)) {
      if (heroParallaxLocked) {
        if (panel._parallaxLockApplied && !forceApply) return;
        gsap.set(panel.visual, { clearProps: 'transform' });
        panel._parallaxLockApplied = true;
        panel._lastParallaxY = 0;
      } else {
        if (panel._lastParallaxY === nextY && !forceApply) return;
        gsap.set(panel.visual, { y: nextY, overwrite: false });
        panel._parallaxLockApplied = false;
        panel._lastParallaxY = nextY;
      }
    }
  };

  const applyPanelState = (panel, isActive) => {
    panel.root.dataset.fixedSectionActive = isActive ? 'true' : 'false';
    panel.root.setAttribute('aria-hidden', isActive ? 'false' : 'true');

    const styleState = {
      autoAlpha: isActive ? 1 : 0,
      zIndex: isActive ? 1 : 0,
      y: isActive ? getParallaxOffset(panel) : 0,
      pointerEvents: 'none',
      overwrite: true
    };

    if (typeof gsap !== 'undefined') {
      gsap.set(panel.visual, styleState);
      if (isActive && isHeroParallaxLocked(panel)) {
        gsap.set(panel.visual, { clearProps: 'transform' });
      }
    } else {
      panel.visual.style.opacity = isActive ? '1' : '0';
      panel.visual.style.visibility = isActive ? 'visible' : 'hidden';
      panel.visual.style.zIndex = String(isActive ? 1 : 0);
      panel.visual.style.pointerEvents = 'none';
    }
  };

  const setActive = (activeName) => {
    if (state.activeName === activeName) return;
    state.activeName = activeName;

    fixedSections.forEach((panel) => {
      applyPanelState(panel, panel.name === activeName);
    });
  };

  const setActiveByViewportProgress = () => {
    const range = Math.max(window.innerHeight, 1);
    const index = Math.max(0, Math.min(fixedSections.length - 1, Math.floor(window.scrollY / range)));
    setActive(fixedSections[index].name);
  };

  const setActiveByTriggerPosition = () => {
    if (triggerRecords.length === 0) {
      setActiveByViewportProgress();
      return;
    }

    const viewportActivationLine = window.innerHeight;
    const activeRecord = triggerRecords.reduce((current, record) => {
      const rect = record.element.getBoundingClientRect();
      if (rect.top <= viewportActivationLine) return record;
      return current;
    }, triggerRecords[0]);
    setActive(activeRecord.name);
  };

  const buildNativeFallback = () => {
    state.onScroll = setActiveByViewportProgress;
    state.onResize = setActiveByViewportProgress;
    window.addEventListener('scroll', state.onScroll, { passive: true });
    window.addEventListener('resize', state.onResize);
    setActiveByViewportProgress();
    console.warn('🧱 fixed-sections: no matching spacer triggers found; using viewport fallback', fixedSections.map((panel) => panel.name));
  };

  setActiveByTriggerPosition();

  if (typeof gsap === 'undefined') {
    buildNativeFallback();
    return;
  }

  loadScrollTriggerOnce().then(() => {
    if (window.fixedSectionSortingRunId !== runId) return;

    if (triggerRecords.length > 0) {
      triggerRecords.forEach((record, index) => {
        const panel = sectionByName.get(record.name);
        state.triggers.push(ScrollTrigger.create({
          trigger: record.element,
          start: 'top bottom',
          end: 'bottom bottom',
          refreshPriority: index,
          onEnter: () => setActive(record.name),
          onEnterBack: () => setActive(record.name),
          onLeaveBack: () => {
            const previousRecord = triggerRecords[Math.max(0, index - 1)];
            setActive(previousRecord.name);
          }
        }));
        // On mobile, the address bar's changing innerHeight makes the fixed-section
        // parallax offset jitter and shoves the footer past the viewport (exposing
        // the page background). Skip the parallax entirely there — sections sit flush.
        const isMobileViewport = window.matchMedia('(max-width: 767px)').matches
          || window.matchMedia('(pointer: coarse)').matches;
        if (panel && isMobileViewport) {
          setPanelParallaxOffset(panel, 0, true);
        } else if (panel) {
          const isFooter = record.name === 'footer';
          const footerParallaxStartOffset = window.innerHeight * 0.12;
          const parallaxScrollRatio = 0.28;
          const easeParallaxProgress = gsap.parseEase ? gsap.parseEase('sine.inOut') : (progress) => progress;
          const getSoftenedParallaxDistance = (self) => {
            const scrollDistance = Math.max(0, self.scroll() - self.start);
            const softStartDistance = Math.max(window.innerHeight, 1);
            const softStartProgress = Math.min(scrollDistance / softStartDistance, 1);
            return scrollDistance * parallaxScrollRatio * easeParallaxProgress(softStartProgress);
          };
          const getParallaxY = (self) => isFooter
            ? footerParallaxStartOffset * (1 - easeParallaxProgress(self.progress))
            : -getSoftenedParallaxDistance(self);
          const updateParallaxFromTrigger = (self) => {
            const heroParallaxLocked = panel.name === 'hero' && window.heroFullscreenParallaxLock === true;
            const y = self.isActive && !heroParallaxLocked ? getParallaxY(self) : 0;
            setPanelParallaxOffset(panel, y, self.isActive && state.activeName === panel.name);
          };

          setPanelParallaxOffset(panel, isFooter ? footerParallaxStartOffset : 0);
          state.parallaxTweens.push(ScrollTrigger.create({
            trigger: record.element,
            start: isFooter ? 'top bottom' : 'bottom bottom',
            end: isFooter ? 'top top' : 'bottom top',
            invalidateOnRefresh: true,
            refreshPriority: index + 0.1,
            onUpdate: updateParallaxFromTrigger,
            onRefresh: updateParallaxFromTrigger,
            onLeave: () => setPanelParallaxOffset(panel, 0, true),
            onLeaveBack: () => setPanelParallaxOffset(panel, 0, true)
          }));
        }
      });
      setActiveByTriggerPosition();
      console.log('🧱 fixed-sections: using spacer triggers', triggerRecords.map((record) => record.name));
    } else {
      state.triggers.push(ScrollTrigger.create({
        id: 'fixed-section-sorting',
        start: 0,
        end: () => Math.max(window.innerHeight * fixedSections.length, 1),
        invalidateOnRefresh: true,
        onUpdate: setActiveByViewportProgress,
        onRefresh: setActiveByViewportProgress,
        onLeave: () => setActive(fixedSections[fixedSections.length - 1].name),
        onLeaveBack: () => setActive(fixedSections[0].name)
      }));
      setActiveByViewportProgress();
      console.warn('🧱 fixed-sections: no matching spacer triggers found; using viewport fallback', fixedSections.map((panel) => panel.name));
    }

    ScrollTrigger.refresh();
  }).catch((err) => {
    console.warn('🧱 fixed-sections: ScrollTrigger unavailable, using native fallback', err);
    buildNativeFallback();
  });
}

function initHeroLoadText(scene) {
  const wrappers = Array.from(scene.querySelectorAll('[data-load-text]'));
  if (wrappers.length === 0 || typeof gsap === 'undefined') return null;
  if (scene._heroLoadTextState) return scene._heroLoadTextState;

  scene.dataset.heroLoadTextInitialized = 'true';

  const textTargetSelector = 'h1, h2, h3, h4, h5, h6, p, [data-text-target]';
  const textItems = wrappers.map((wrapper) => {
    const target = wrapper.querySelector(textTargetSelector) || wrapper;
    target.querySelectorAll('[data-hero-load-text-layer]').forEach((layer) => layer.remove());
    if ((target.textContent || '').trim().length === 0 && target.dataset.loadTextOriginal) {
      target.textContent = target.dataset.loadTextOriginal;
    }
    const originalText = target.dataset.loadTextOriginal || target.textContent || '';
    target.dataset.loadTextOriginal = originalText;
    if (originalText.trim().length === 0) return null;

    const stableLayer = document.createElement('span');
    const typeLayer = document.createElement('span');
    target.textContent = '';
    target.style.display = 'grid';
    target.style.whiteSpace = 'pre-wrap';
    stableLayer.textContent = originalText;
    stableLayer.dataset.heroLoadTextLayer = 'stable';
    stableLayer.setAttribute('aria-hidden', 'true');
    stableLayer.style.gridArea = '1 / 1';
    stableLayer.style.visibility = 'hidden';
    stableLayer.style.whiteSpace = 'pre-wrap';
    typeLayer.dataset.heroLoadTextLayer = 'typed';
    typeLayer.setAttribute('aria-hidden', 'true');
    typeLayer.style.gridArea = '1 / 1';
    typeLayer.style.whiteSpace = 'pre-wrap';
    typeLayer.style.pointerEvents = 'none';
    target.appendChild(stableLayer);
    target.appendChild(typeLayer);

    return { wrapper, target, originalText, typeLayer };
  }).filter((item) => item && item.originalText.trim().length > 0);

  if (textItems.length === 0) return null;

  textItems.forEach(({ wrapper, target, typeLayer }) => {
    gsap.set(wrapper, { autoAlpha: 1 });
    gsap.set(target, { autoAlpha: 0 });
    gsap.set(typeLayer, { autoAlpha: 0 });
  });

  const tl = gsap.timeline({ paused: true, delay: 0.18 });

  textItems.forEach(({ target, typeLayer, originalText }, index) => {
    const startAt = index === 0 ? 0 : '>-0.05';
    // 30% faster typing (durations ×0.7): coeff 0.018→0.0126, bounds 0.24→0.168, 0.55→0.385
    const typeDuration = Math.min(0.385, Math.max(0.168, originalText.trim().length * 0.0126));
    const steps = Math.min(28, Math.max(8, originalText.trim().length));

    tl.to(target, { autoAlpha: 1, duration: 0.16, ease: 'power2.out' }, startAt)
      .to(typeLayer, { autoAlpha: 1, duration: 0.16, ease: 'power2.out' }, '<')
      .to(typeLayer, {
        text: originalText,
        duration: typeDuration,
        ease: `steps(${steps})`,
        onStart: () => {
          typeLayer.textContent = '';
        },
        onComplete: () => {
          typeLayer.textContent = originalText;
        }
      }, '<0.04');
  });

  scene._heroLoadTextState = {
    timeline: tl,
    wrappers,
    fadeTargets: textItems.map(({ target }) => target),
    targets: textItems
  };
  return scene._heroLoadTextState;
}

function initScrubTypeText() {
  if (typeof gsap === 'undefined') return;

  const wrappers = Array.from(document.querySelectorAll('[data-type-text]'));
  if (wrappers.length === 0) return;

  if (window.scrubTypeTextState) {
    window.scrubTypeTextState.triggers?.forEach((trigger) => trigger.kill());
    window.scrubTypeTextState.timelines?.forEach((timeline) => timeline.kill());
    window.scrubTypeTextState.targets?.forEach(({ target, originalText }) => {
      target.textContent = originalText;
    });
    window.scrubTypeTextState.overlays?.forEach((overlay) => {
      gsap.set(overlay, { clearProps: 'opacity' });
    });
  }

  const state = { triggers: [], timelines: [], targets: [], overlays: [] };
  window.scrubTypeTextState = state;

  const getTypeName = (element) => (element.getAttribute('data-type-text') || '').trim().toLowerCase();
  const getTriggerName = (element) => {
    const rawValue =
      element.getAttribute('data-fixed-trigger') ||
      element.getAttribute('data-section-trigger') ||
      element.getAttribute('data-section-spacer') ||
      element.getAttribute('data-section-scroll') ||
      '';
    return rawValue.trim().toLowerCase();
  };
  const triggerElements = Array.from(document.querySelectorAll(
    '[data-fixed-trigger], [data-section-trigger], [data-section-spacer], [data-section-scroll]'
  ));
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  loadScrollTriggerOnce().then(() => {
    wrappers.forEach((wrapper, index) => {
      const typeName = getTypeName(wrapper);
      if (!typeName) return;

      const target = wrapper.querySelector('h1, h2, h3, h4, h5, h6, p, [data-text-target]') || wrapper;
      const originalText = target.dataset.scrubTypeOriginal || target.textContent || '';
      if (originalText.trim().length === 0) return;

      target.dataset.scrubTypeOriginal = originalText;
      state.targets.push({ target, originalText });

      if (prefersReducedMotion) {
        target.textContent = originalText;
        gsap.set(target, { opacity: 1 });
        return;
      }

      // Scrub mode = tied to a fixed section's scroll (e.g. "quote", which has a
      // matching spacer trigger / [data-section]). Play-once mode = no matching
      // section (e.g. "intro"): same word reveal, but triggered once when the
      // element scrolls into view, at its natural pace, and it STAYS revealed.
      const matchedTrigger =
        triggerElements.find((element) => getTriggerName(element) === typeName) ||
        document.querySelector(`[data-section="${typeName}"]`) || null;
      const playOnce = !matchedTrigger;
      // The in-view trigger must be a REAL box. The data-type-text wrapper is
      // usually a Lumos display:contents slot (no measurable position), which
      // leaves the scrub stuck at fully-revealed. Resolve to the text element
      // itself, or the nearest real ancestor box.
      const resolveBox = (el) => {
        let cur = el;
        while (cur && window.getComputedStyle(cur).display === 'contents') {
          cur = cur.firstElementChild || cur.parentElement;
          if (cur && window.getComputedStyle(cur).display !== 'contents') break;
        }
        return cur || el;
      };
      const inViewTrigger = (target && window.getComputedStyle(target).display !== 'contents')
        ? target
        : resolveBox(wrapper);
      const trigger = matchedTrigger || inViewTrigger;
      const section = Array.from(document.querySelectorAll('[data-section]')).find((element) => {
        return (element.getAttribute('data-section') || '').trim().toLowerCase() === typeName;
      });
      const overlay = section?.querySelector('.u-overlay') || null;

      target.textContent = '';
      target.style.whiteSpace = 'pre-wrap';

      const words = originalText.split(/(\s+)/).reduce((items, part) => {
        if (part.length === 0) return items;
        if (/^\s+$/.test(part)) {
          target.appendChild(document.createTextNode(part));
          return items;
        }

        const span = document.createElement('span');
        span.textContent = part;
        target.appendChild(span);
        items.push(span);
        return items;
      }, []);

      gsap.set(words, {
        '--scrub-type-progress': '0%',
        color: 'inherit',
        backgroundColor: 'color-mix(in lab, currentColor 22%, transparent)',
        backgroundImage: 'linear-gradient(90deg, currentColor, currentColor var(--scrub-type-progress), transparent var(--scrub-type-progress))',
        backgroundClip: 'text',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent'
      });

      const tl = gsap.timeline({
        scrollTrigger: playOnce
          ? {
              // SAME scrub feel as the quote, but mapped to this element scrolling
              // into view (e.g. "intro" — a normal in-flow element, not a pinned
              // section). The reveal is bound to your scroll, so it feels natural.
              trigger,
              start: 'top 85%',
              end: 'top 35%',
              scrub: 0.3,
              invalidateOnRefresh: true,
              refreshPriority: 20 + index
            }
          : {
              // Scrub mode (e.g. "quote") — reveal tied to the pinned section's scroll.
              trigger,
              start: 'top center',
              end: () => `+=${window.innerHeight * 1.6}`,
              scrub: 0.3,
              invalidateOnRefresh: true,
              refreshPriority: 20 + index
            }
      });

      words.forEach((word) => {
        tl.to(word, {
          '--scrub-type-progress': '100%',
          duration: Math.max(0.08, word.textContent.length * 0.035),
          ease: 'none'
        });
      });

      const textRevealDuration = tl.duration();
      if (overlay) {
        const overlayDelay = Math.min(0.25, textRevealDuration * 0.2);
        const overlayStartOpacity = typeName === 'quote' ? 0.3 : 0;
        gsap.set(overlay, { opacity: overlayStartOpacity });
        tl.to(overlay, {
          opacity: 1,
          duration: Math.max(0.1, textRevealDuration - overlayDelay),
          ease: 'none'
        }, overlayDelay);
        state.overlays.push(overlay);
      }

      // Pinned/section mode reveals → HOLDS → disappears (clears for the next
      // section). The in-view scrub mode (e.g. "intro") just reveals and STAYS.
      if (!playOnce) {
        const holdDuration = Math.max(0.8, textRevealDuration * 1.4);
        const fadeDuration = Math.max(0.4, textRevealDuration * 0.4);
        // On exit, fade the parent wrap ([data-quote="wrap"]) as a unit. The wrap
        // is often a Lumos display:contents slot (which can't be faded — it has no
        // box), so resolve it to its actual rendered child boxes and fade those.
        const renderedBoxes = (el) => {
          if (!el) return [];
          if (window.getComputedStyle(el).display !== 'contents') return [el];
          return Array.from(el.children).reduce((acc, c) => acc.concat(renderedBoxes(c)), []);
        };
        const quoteWrap = target.closest('[data-quote="wrap"]') || wrapper.closest('[data-quote="wrap"]');
        const boxes = quoteWrap ? renderedBoxes(quoteWrap) : [];
        const exitTargets = boxes.length ? boxes : words;
        tl.to(exitTargets, { opacity: 0, duration: fadeDuration, ease: 'none' }, textRevealDuration + holdDuration);
      }

      state.timelines.push(tl);
      if (tl.scrollTrigger) state.triggers.push(tl.scrollTrigger);
    });
  }).catch(err => console.error('⌨️ scrub-type-text:', err));
}

// ================================================================================
// ⌨️  HEADER TYPEWRITER  (data-header="type")
// ================================================================================
// Non-destructive typewriter using GSAP SplitText (free since GSAP 3.13, April 2024).
//
// Unlike the previous TextPlugin-based implementation, this one does NOT mutate the
// host heading element:
//   • Its `display`, `white-space`, and other CSS are left alone — Lumos's
//     `display: flow-root` line-height-trim keeps working.
//   • Nested markup like <strong> is preserved — `.u-heading-accent strong { … }`
//     and similar accent rules still apply both during and after the reveal.
//   • The heading's natural block sizing is unchanged — max-width / container
//     constraints are respected.
//
// SplitText wraps each character in its own inline-block child, leaving everything
// above untouched. On cleanup we call split.revert() which restores the original DOM
// byte-for-byte.
function initHeaderTypeText() {
  if (typeof gsap === 'undefined') return;

  // Double-init guard: on initial load BOTH the standalone path and the Barba
  // 'once' hook call this. The second call would revert the first split and
  // re-type ("appears, animates, animates again"). If every data-header="type"
  // heading on the CURRENT DOM is already split, this is the duplicate call —
  // skip it. (Barba page swaps replace the container, so freshly-loaded headings
  // have no split chars yet and DO run.)
  const liveWrappers = Array.from(document.querySelectorAll('[data-header="type"]'))
    .filter((w) => !w.querySelector('[data-type-build]') && !w.closest('[data-type-build]'));
  if (liveWrappers.length > 0 && liveWrappers.every((w) => w.querySelector('.header-type__char'))) {
    return;
  }

  // Clean up previous run (revert splits, kill triggers/timelines).
  if (window.headerTypeTextState) {
    const oldState = window.headerTypeTextState;
    oldState.triggers?.forEach((trigger) => trigger.kill());
    oldState.timelines?.forEach((timeline) => timeline.kill());
    oldState.splits?.forEach((split) => { try { split.revert(); } catch (e) {} });
    oldState.wrappers?.forEach((wrapper) => {
      gsap.set(wrapper, { clearProps: 'opacity,visibility' });
    });
  }

  // Skip any data-header="type" wrapper that contains a data-type-build element —
  // that heading is driven by the type-build sequence, not the SplitText
  // typewriter. Running both on the same <h2> made it appear-then-retype.
  const wrappers = Array.from(document.querySelectorAll('[data-header="type"]'))
    .filter((w) => !w.querySelector('[data-type-build]') && !w.closest('[data-type-build]'));
  const state = { triggers: [], timelines: [], splits: [], wrappers: [] };
  window.headerTypeTextState = state;

  const runId = (window.headerTypeTextRunId || 0) + 1;
  window.headerTypeTextRunId = runId;

  if (wrappers.length === 0) return;

  const textTargetSelector = 'h1, h2, h3, h4, h5, h6, p, [data-text-target]';
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Find the deepest text-bearing element(s) inside each wrapper.
  const getTextTargets = (wrapper) => {
    const candidates = Array.from(wrapper.querySelectorAll(textTargetSelector))
      .filter((target) => (target.textContent || '').trim().length > 0)
      .filter((target) => !target.closest('[data-type-build]'));
    const leafTargets = candidates.filter((target) =>
      !candidates.some((other) => other !== target && target.contains(other))
    );
    return leafTargets.length > 0 ? leafTargets : [wrapper];
  };

  const wrapperItems = wrappers.map((wrapper) => {
    const targets = getTextTargets(wrapper);
    state.wrappers.push(wrapper);
    return { wrapper, targets };
  }).filter((item) => item.targets.length > 0);

  if (wrapperItems.length === 0) return;

  // Reduced motion: just show the headings, no animation, no DOM mutation.
  if (prefersReducedMotion) {
    wrapperItems.forEach(({ wrapper }) => {
      gsap.set(wrapper, { autoAlpha: 1 });
    });
    return;
  }

  Promise.all([loadScrollTriggerOnce(), loadSplitTextOnce()]).then(() => {
    if (window.headerTypeTextRunId !== runId) return;

    wrapperItems.forEach(({ targets }, wrapperIndex) => {
      targets.forEach((target, targetIndex) => {
        if ((target.textContent || '').trim().length === 0) return;
        // Defensive: never re-split a heading that's already been split.
        if (target.querySelector('.header-type__char')) return;

        // Non-destructive split. SplitText preserves nested <strong>/<em>/etc.,
        // wraps each visible character in an inline-block <div class="char">,
        // and leaves the host element's own styles + classes untouched.
        //
        // type: 'words, chars' is important — without the words layer, individual
        // chars are independent inline-block boxes and the browser can break a
        // line mid-word ("softwar" / "e"). Wrapping each word first turns the
        // word into a single unbreakable unit; chars only animate, they don't
        // affect wrapping.
        let split;
        try {
          split = SplitText.create(target, {
            type: 'words, chars',
            charsClass: 'header-type__char',
            wordsClass: 'header-type__word',
            // No mask — we don't want clipping; we want each char to honor any
            // accent <strong> rules inherited from its ancestors.
          });
        } catch (e) {
          console.warn('⌨️ header-type-text: SplitText.create failed', e);
          return;
        }
        state.splits.push(split);

        const chars = split.chars || [];
        if (chars.length === 0) return;

        // Hide every character; reveal them in sequence to produce the typing feel.
        gsap.set(chars, { autoAlpha: 0 });

        const charPace = 0.0175; // 30% faster (was 0.025) → ~57 chars/sec
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: target,
            start: 'top 85%',
            toggleActions: 'play none none none',
            once: true,
            invalidateOnRefresh: true,
            refreshPriority: 30 + wrapperIndex + targetIndex * 0.01
          }
        });

        tl.to(chars, {
          autoAlpha: 1,
          duration: 0.01,        // effectively instant per character → typed feel, not faded
          ease: 'none',
          stagger: charPace
        });

        // If already in view at init, force-play (matches old behavior).
        requestAnimationFrame(() => {
          const rect = target.getBoundingClientRect();
          if (rect.top <= window.innerHeight * 0.85 && tl.progress() === 0) tl.play();
        });

        state.timelines.push(tl);
        if (tl.scrollTrigger) state.triggers.push(tl.scrollTrigger);
      });
    });

  }).catch(err => console.error('⌨️ header-type-text:', err));
}

function initHeroAnimation() {
  const scene = document.querySelector('[data-scene="ground-autonomy"]');
  if (!scene) return;
  delete scene.dataset.heroReady;
  window.heroFullscreenParallaxLock = false;

  const hero  = document.getElementById('hero');
  if (!hero) { console.warn('🎬 hero-animation: no #hero in document'); return; }

  const outer = scene.closest('.hero_outer') || scene.parentElement;
  if (!outer) { console.warn('🎬 hero-animation: cannot find .hero_outer scroll-length container'); return; }

  injectHeroScrollGuardStyles();
  Promise.all([loadScrollTriggerOnce(), loadTextPluginOnce()])
    .then(build)
    .catch(err => console.error('🎬 hero-animation:', err));

  let masterTl = null;
  let exitTl = null;
  let heroCardTypeTl = null;

  function build() {
    if (heroCardTypeTl) {
      heroCardTypeTl.kill();
      heroCardTypeTl = null;
    }
    if (exitTl) {
      if (exitTl.scrollTrigger) exitTl.scrollTrigger.kill();
      exitTl.kill();
      exitTl = null;
    }
    if (masterTl) {
      if (masterTl.scrollTrigger) masterTl.scrollTrigger.kill();
      masterTl.kill();
      gsap.set(document.querySelectorAll(
        '.hero_cell_outer, .hero_cell_wrap, .hero_cell_label_wrap, .hero_cell_title_wrap, .hero_cell_pointer, #hero .hero_cell_wrap .u-image-wrapper, #hero .hero_cell_wrap img, [data-scene-titles], .hero_curtain, [data-header="svg"], [data-header="SVG"], .hero_text_outer'
      ), { clearProps: 'all' });
    }

    const titles = document.querySelector('[data-scene-titles]');
    const svgHeader = scene.querySelector('[data-header="svg"], [data-header="SVG"]') || scene.querySelector('.hero_text_outer');
    const heroCurtain = scene.querySelector('.hero_curtain');
    const navHost = document.querySelector('[data-nav="wrap"]');
    const navWrap = navHost?.querySelector('.nav_wrap') || document.querySelector('.nav_wrap') || navHost;
    const cells  = gsap.utils.toArray('.hero_cell_outer');
    if (!cells.length) { console.warn('🎬 hero-animation: no .hero_cell_outer cells found'); return; }
    const heroIdx = cells.indexOf(hero);
    if (heroIdx === -1) { console.warn('🎬 hero-animation: #hero is not a .hero_cell_outer cell'); return; }

    const mediaOf  = c => c.querySelector('.hero_cell_wrap');
    const labelOf  = c => c.querySelector('.hero_cell_label_wrap');
    const nameOf   = c => c.querySelector('.hero_cell_title_wrap');
    const borderOf = c => c.querySelector('.hero_cell_pointer');
    // Media contents excludes the optional border strip so Stage 2 only reveals card media.
    const mediaContentsOf = c => Array.from(
      c.querySelectorAll('.hero_cell_wrap > *:not(.hero_cell_pointer)')
    );
    const textTargetOf = wrapper => wrapper?.querySelector('h1, h2, h3, h4, h5, h6, p, [data-text-target]') || wrapper;
    let heroLoadTextState = null;

    const nonHero  = cells.filter(c => c !== hero);
    const heroCardEntryOffset = () => Math.min(window.innerWidth * 0.14, 140);
    const heroCardEntryScale = 1.5;
    const heroWrap = mediaOf(hero); // the image-area container of #hero — this is what covers viewport

    // INITIAL STATE
    // Non-hero cells: their image-area contents start hidden (not the wrap itself, so borders stay positioned)
    gsap.set(nonHero.flatMap(mediaContentsOf), { opacity: 0 });
    gsap.set(cells.map(labelOf).filter(Boolean),   { opacity: 0, x: 0, scale: 1, willChange: 'opacity' });
    gsap.set(cells.map(nameOf).filter(Boolean),    { opacity: 0, x: 0, scale: 1, willChange: 'opacity' });
    nonHero.forEach((cell) => {
      const direction = cells.indexOf(cell) < heroIdx ? -1 : 1;
      gsap.set(mediaContentsOf(cell).filter(Boolean), {
        x: () => direction * heroCardEntryOffset(),
        scale: heroCardEntryScale,
        willChange: 'transform, opacity'
      });
    });
    gsap.set(cells.map(borderOf).filter(Boolean),  { scaleY: 0, transformOrigin: 'top center' });

    // Hero clip-path reveal: position the image-wrapper at viewport size, then
    // animate its clip-path from inset(0) (full viewport visible) to positive
    // insets matching the natural cell-slot. The image inside doesn't transform.
    // CSS clip-path with NEGATIVE inset is clamped to 0, so we cannot expand a
    // small element via clip-path — instead we expand the element itself.
    // Support both Visual Image (.u-image-wrapper > img) and Visual Video (<video>
    // child of .hero_cell_wrap, no wrapper). When .u-image-wrapper is absent, fall
    // back to the <video> / <picture> / <img> element itself — GSAP transforms and
    // clip-path apply to video/img elements just as they do to a wrapper div.
    // This keeps the hero intro choreography (clip-path zoom + typewriter) working
    // whether the hero cell media is an image or a video.
    const heroImgWrap = heroWrap
      ? (heroWrap.querySelector('.u-image-wrapper')
         || heroWrap.querySelector('video')
         || heroWrap.querySelector('picture')
         || heroWrap.querySelector('img'))
      : null;
    let heroFinalClip = null; // remembered for stage 1
    let heroWrapRect  = null;
    if (heroWrap && heroImgWrap) {
      const r = heroWrap.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        heroWrapRect = r;
        // Keep .hero_cell_wrap visually intact: freeze its natural size so the
        // grid layout doesn't collapse when its child becomes absolute, and
        // allow overflow so the expanded image-wrapper is visible.
        gsap.set(heroWrap, {
          overflow: 'visible',
          width:  `${r.width}px`,
          height: `${r.height}px`
        });
        // Image-wrapper: fixed during stage 1 so Chrome's root scroll/paint never
        // exposes page background above the fullscreen frame.
        gsap.set(heroImgWrap, {
          position: 'fixed',
          top:    '0px',
          left:   '0px',
          right:  'auto',
          bottom: 'auto',
          width:  `${window.innerWidth}px`,
          height: `${window.innerHeight}px`,
          maxWidth: 'none',
          maxHeight: 'none',
          opacity: scene.dataset.heroIntroPlayed === 'true' ? 1 : 0,
          scale: scene.dataset.heroIntroPlayed === 'true' ? 1 : 1.08,
          clipPath: 'inset(0px 0px 0px 0px)',
          willChange: 'clip-path, top, left, width, height'
        });
        // Final clip-path (the cell-slot framed inside viewport coords):
        heroFinalClip = `inset(${r.top}px ${window.innerWidth - r.right}px ${window.innerHeight - r.bottom}px ${r.left}px)`;
        // Give the hero its own stacking context so its expanded image renders above sibling cells
        gsap.set(hero, { position: 'relative', zIndex: 5 });
        scene.dataset.heroReady = 'true';
        heroLoadTextState = initHeroLoadText(scene);
      } else {
        console.warn('🎬 hero-animation: #hero .hero_cell_wrap has zero size, clip-path init skipped');
      }
    } else {
      console.warn('🎬 hero-animation: #hero is missing .hero_cell_wrap or .u-image-wrapper');
    }

    console.log('🎬 hero-animation: ready —', cells.length, 'cells, hero at index', heroIdx, '· trigger=', outer.className);

    // Wait for the hero's intro media to be ready before playing intro text.
    // Supports <img> (img.complete + decode), <video> (readyState + canplay), and
    // the case where heroImgWrap IS the media element directly (no wrapper).
    const waitForHeroIntroImage = () => {
      if (!heroImgWrap) return Promise.resolve();
      const media = heroImgWrap.matches?.('img, video')
        ? heroImgWrap
        : (heroImgWrap.querySelector('img, video'));
      if (!media) return Promise.resolve();
      if (media.tagName === 'VIDEO') {
        if (media.readyState >= 2) return Promise.resolve(); // HAVE_CURRENT_DATA
        return new Promise((resolve) => {
          const done = () => resolve();
          media.addEventListener('canplay', done, { once: true });
          media.addEventListener('error', done, { once: true });
        });
      }
      if (media.complete) {
        return typeof media.decode === 'function'
          ? media.decode().catch(() => undefined)
          : Promise.resolve();
      }
      return new Promise((resolve) => {
        const done = () => resolve();
        media.addEventListener('load', done, { once: true });
        media.addEventListener('error', done, { once: true });
      });
    };
    const waitForHeroIntroImageReady = () => {
      return Promise.race([
        waitForHeroIntroImage(),
        new Promise((resolve) => setTimeout(resolve, 1200))
      ]);
    };

    const playHeroIntro = () => {
      const introTargets = [navWrap, svgHeader, heroImgWrap, heroCurtain].filter(Boolean);
      const heroLoadTextTl = heroLoadTextState?.timeline;
      let heroLoadTextPlayRequested = false;
      const playHeroLoadText = () => {
        if (!heroLoadTextTl || heroLoadTextPlayRequested || heroLoadTextTl.progress() >= 1) return;
        heroLoadTextPlayRequested = true;
        waitForHeroIntroImageReady().then(() => {
          if (heroLoadTextTl.progress() < 1) heroLoadTextTl.play(0);
        });
      };
      const revealInitialPaint = () => {
        document.documentElement.classList.add('reactive-intro-ready');
      };
      if (introTargets.length === 0) {
        revealInitialPaint();
        playHeroLoadText();
        return;
      }

      // NEW PAGE-LOAD ANIMATION: when the hero uses data-type-build, the old
      // intro choreography is replaced by the type-build sequence (curtain →
      // type → background → rest). Snap the hero to its resting VISIBLE state so
      // the scroll timeline (parallax, card scrub, exit) keeps working unchanged,
      // but leave the curtain BLACK and on top — initTypeBuild lifts it as part
      // of the staged reveal.
      // The text + curtain may live OUTSIDE this scene element, so check the whole
      // document — otherwise the normal intro runs and fades the curtain away
      // before the typing even starts.
      if (document.querySelector('[data-type-build]')) {
        if (navWrap) gsap.set(navWrap, { autoAlpha: 1, clipPath: 'inset(0 0% 0 0)' });
        if (svgHeader) gsap.set(svgHeader, { autoAlpha: 1, y: 0 });
        if (heroImgWrap) gsap.set(heroImgWrap, { opacity: 1, scale: 1 });
        // Curtain stays BLACK at load (its Webflow default, behind the text) —
        // initTypeBuild lifts it after the first phrase. Don't fade it here.
        if (heroCurtain) gsap.set(heroCurtain, { autoAlpha: 1, pointerEvents: 'none' });
        scene.dataset.heroIntroPlayed = 'true';
        revealInitialPaint();
        return;
      }

      if (scene.dataset.heroIntroPlayed === 'true') {
        if (navWrap) gsap.set(navWrap, { autoAlpha: 1, clipPath: 'inset(0 0% 0 0)' });
        if (svgHeader) gsap.set(svgHeader, { autoAlpha: 1, y: 0 });
        if (heroImgWrap) gsap.set(heroImgWrap, { opacity: 1, scale: 1 });
        if (heroCurtain) gsap.set(heroCurtain, { autoAlpha: 0, pointerEvents: 'none' });
        if (heroLoadTextTl) {
          gsap.set(heroLoadTextState.wrappers, { autoAlpha: 1 });
          gsap.set(heroLoadTextState.fadeTargets, { autoAlpha: 1 });
          heroLoadTextTl.progress(1).pause();
        }
        revealInitialPaint();
        return;
      }

      scene.dataset.heroIntroPlayed = 'true';
      if (navWrap) {
        gsap.set(navWrap, {
          autoAlpha: 0,
          clipPath: 'inset(0 100% 0 0)',
          transformOrigin: 'left center',
          willChange: 'clip-path, opacity'
        });
      }
      if (svgHeader) {
        // No intro slide — the heading reveals via its own typewriter
        // (data-header="type"). Only fade is kept (coordinated with the curtain);
        // the y-translate was competing with the typing animation.
        gsap.set(svgHeader, {
          autoAlpha: 0,
          willChange: 'opacity'
        });
      }
      if (heroImgWrap) {
        gsap.set(heroImgWrap, {
          opacity: 0,
          scale: 1.08,
          transformOrigin: 'center center',
          willChange: 'clip-path, top, left, width, height, opacity, transform'
        });
      }
      if (heroCurtain) {
        gsap.set(heroCurtain, {
          autoAlpha: 1,
          pointerEvents: 'none',
          willChange: 'opacity'
        });
      }
      revealInitialPaint();

      const introTl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      if (heroCurtain) {
        introTl.to(heroCurtain, {
          autoAlpha: 0,
          duration: 0.55,
          ease: 'power2.out',
          onComplete: () => {
            heroCurtain.style.pointerEvents = 'none';
          }
        }, 0);
      }
      if (navWrap) {
        introTl.to(navWrap, {
          autoAlpha: 1,
          clipPath: 'inset(0 0% 0 0)',
          duration: 0.75
        }, 0.08);
      }
      if (svgHeader) {
        introTl.to(svgHeader, {
          autoAlpha: 1,
          duration: 0.85
        }, 0.22);
      }
      if (heroImgWrap) {
        introTl.to(heroImgWrap, {
          opacity: 1,
          scale: 1,
          duration: 0.95,
          ease: 'power2.out',
          onStart: playHeroLoadText
        }, 0.48);
      } else {
        introTl.call(playHeroLoadText, null, 0.48);
      }
    };
    playHeroIntro();

    let renderHeroStage1 = null;
    let syncHeroCardTypePlayback = null;
    const updateHeroScrollTimelines = () => {
      if (renderHeroStage1) renderHeroStage1();
      if (syncHeroCardTypePlayback) syncHeroCardTypePlayback();
    };

    // CSS `position: sticky` on .hero_contain handles the visual pinning.
    // We just scrub the timeline across the scroll-length of .hero_outer.
    masterTl = gsap.timeline({
      defaults: { ease: 'power2.inOut' },
      onUpdate: updateHeroScrollTimelines,
      scrollTrigger: {
        trigger: outer,
        start: 'top top',
        end: 'bottom bottom',
        scrub: true,
        invalidateOnRefresh: true,
        onUpdate: updateHeroScrollTimelines
      }
    });

    // STAGE 1 — the mask starts first and leads, while the image-wrapper follows
    // with a short delay. Both finish together at the final grid cell state.
    const heroShrinkStart = 0;
    const heroShrinkDuration = 1.5;
    const heroImageLag = 0.22;
    const heroMaskDuration = heroShrinkDuration;
    const heroImageDuration = heroShrinkDuration - heroImageLag;
    const heroTitleFadeStart = heroShrinkStart + heroImageLag + heroImageDuration * 0.5;
    const heroTitleFadeDuration = 0.45;
    const heroSvgFadeStart = heroShrinkStart + 0.08;
    const heroSvgFadeDuration = 0.45;
    const heroStage2Overlap = 0.3;
    const heroStage2Start = heroShrinkStart + heroShrinkDuration - heroStage2Overlap;
    const heroLoadTextFadeStart = heroStage2Start - 0.1;
    const heroLoadTextFadeDuration = 0.35;
    const heroStage2FadeDuration = 0.55;
    const heroStage2Stagger = 0.08;
    const heroStage2MaxDelay = Math.max(heroIdx, cells.length - 1 - heroIdx) * heroStage2Stagger;
    const heroGridHoldDuration = 0.35;
    const heroGridHoldStart = heroStage2Start + heroStage2MaxDelay + heroStage2FadeDuration;
    const heroExitDriftDuration = 2.2;
    const heroCardDriftProfiles = [
      { y: 0.04 },
      { y: 0.08 },
      { y: 0.02 },
      { y: 0.06 },
      { y: 0.1 }
    ];
    const heroSvgHeaderExitDistance = -0.28;
    const heroCardTypeStart = heroStage2Start + 0.16;
    const heroCardTypeCardStaggers = [0.22, 0.08, 0, 0.15, 0.29];
    const heroCardTypeLineStagger = 0.055;
    const heroCardReadableHoldDuration = 1.6;
    masterTl.addLabel('heroShrink', heroShrinkStart);
    let resetHeroCellTransforms = null;
    if (heroImgWrap && heroFinalClip) {
      const lerp = (from, to, progress) => from + (to - from) * progress;
      const clampProgress = gsap.utils.clamp(0, 1);
      const easeStageProgress = gsap.parseEase ? gsap.parseEase('power2.inOut') : (progress) => progress;
      const getStageProgress = (start, duration) => {
        return easeStageProgress(clampProgress((masterTl.time() - start) / duration));
      };
      const heroPanelRoot = document.querySelector('[data-section="hero"]');
      const heroPanelVisual = heroPanelRoot
        ? (window.getComputedStyle(heroPanelRoot).display === 'contents'
          ? (heroPanelRoot.firstElementChild || heroPanelRoot)
          : heroPanelRoot)
        : null;
      let wasFullscreenRange = null;
      const resetHeroPanelParallax = () => {
        window.fixedSectionSortingState?.parallaxOffsets?.set('hero', 0);
        if (heroPanelVisual) gsap.set(heroPanelVisual, { clearProps: 'transform' });
      };
      resetHeroCellTransforms = () => {
        if (exitTl && exitTl.progress() > 0) exitTl.progress(0, true);
        gsap.set(cells, { clearProps: 'transform' });
      };
      renderHeroStage1 = () => {
        const boxProgress = getStageProgress(heroShrinkStart + heroImageLag, heroImageDuration);
        const maskProgress = getStageProgress(heroShrinkStart, heroMaskDuration);
        const isStageComplete = boxProgress >= 1 && maskProgress >= 1;
        const isFullscreenRange = !isStageComplete;
        window.heroFullscreenParallaxLock = isFullscreenRange;

        if (isFullscreenRange && wasFullscreenRange !== true) {
          resetHeroPanelParallax();
          resetHeroCellTransforms();
        }
        wasFullscreenRange = isFullscreenRange;

        if (boxProgress <= 0.001 && maskProgress <= 0.001) {
          gsap.set(heroImgWrap, {
            position: 'fixed',
            top: '0px',
            left: '0px',
            right: 'auto',
            bottom: 'auto',
            width: `${window.innerWidth}px`,
            height: `${window.innerHeight}px`,
            clipPath: 'inset(0px 0px 0px 0px)'
          });
          return;
        }

        const boxTop = lerp(0, heroWrapRect.top, boxProgress);
        const boxLeft = lerp(0, heroWrapRect.left, boxProgress);
        const boxRight = lerp(window.innerWidth, heroWrapRect.right, boxProgress);
        const boxBottom = lerp(window.innerHeight, heroWrapRect.bottom, boxProgress);
        const maskTop = lerp(0, heroWrapRect.top, maskProgress);
        const maskLeft = lerp(0, heroWrapRect.left, maskProgress);
        const maskRight = lerp(window.innerWidth, heroWrapRect.right, maskProgress);
        const maskBottom = lerp(window.innerHeight, heroWrapRect.bottom, maskProgress);

        if (isStageComplete) {
          gsap.set(heroImgWrap, {
            position: 'absolute',
            top: '0px',
            left: '0px',
            right: 'auto',
            bottom: 'auto',
            width: `${heroWrapRect.width}px`,
            height: `${heroWrapRect.height}px`,
            clipPath: 'inset(0px 0px 0px 0px)'
          });
        } else {
          gsap.set(heroImgWrap, {
            position: 'fixed',
            top: `${boxTop}px`,
            left: `${boxLeft}px`,
            right: 'auto',
            bottom: 'auto',
            width: `${boxRight - boxLeft}px`,
            height: `${boxBottom - boxTop}px`,
            clipPath: `inset(${maskTop - boxTop}px ${boxRight - maskRight}px ${boxBottom - maskBottom}px ${maskLeft - boxLeft}px)`
          });
        }
      };

      masterTl.to({}, { duration: heroShrinkDuration, ease: 'none' }, 'heroShrink');
      renderHeroStage1();
    }
    if (svgHeader) masterTl.to(svgHeader, { autoAlpha: 0, duration: heroSvgFadeDuration, ease: 'power2.out' }, heroSvgFadeStart);
    if (heroLoadTextState?.fadeTargets?.length) masterTl.to(heroLoadTextState.fadeTargets, { autoAlpha: 0, duration: heroLoadTextFadeDuration, ease: 'power2.out' }, heroLoadTextFadeStart);
    if (titles) masterTl.to(titles, { opacity: 0, duration: heroTitleFadeDuration, ease: 'power2.in' }, heroTitleFadeStart);

    const createHeroCardTypeItem = (wrapper) => {
      if (!wrapper) return null;

      const target = textTargetOf(wrapper);
      target.querySelectorAll('[data-hero-card-type-layer]').forEach((layer) => layer.remove());
      if ((target.textContent || '').trim().length === 0 && target.dataset.heroCardTypeOriginal) {
        target.textContent = target.dataset.heroCardTypeOriginal;
      }
      const originalText = target.textContent || '';
      if (originalText.trim().length === 0) return null;

      target.dataset.heroCardTypeOriginal = originalText;
      target.textContent = '';
      target.style.display = 'grid';
      target.style.whiteSpace = 'pre-wrap';

      const stableLayer = document.createElement('span');
      const typeLayer = document.createElement('span');
      stableLayer.textContent = originalText;
      stableLayer.dataset.heroCardTypeLayer = 'stable';
      stableLayer.setAttribute('aria-hidden', 'true');
      stableLayer.style.gridArea = '1 / 1';
      stableLayer.style.visibility = 'hidden';
      stableLayer.style.whiteSpace = 'pre-wrap';
      typeLayer.dataset.heroCardTypeLayer = 'typed';
      typeLayer.setAttribute('aria-hidden', 'true');
      typeLayer.style.gridArea = '1 / 1';
      typeLayer.style.whiteSpace = 'pre-wrap';
      typeLayer.style.pointerEvents = 'none';
      typeLayer.style.display = 'inline-block';
      typeLayer.style.width = 'max-content';
      typeLayer.style.maxWidth = '100%';
      typeLayer.style.justifySelf = window.getComputedStyle(target).textAlign === 'right'
        ? 'end'
        : window.getComputedStyle(target).textAlign === 'center'
          ? 'center'
          : 'start';
      target.appendChild(stableLayer);
      target.appendChild(typeLayer);

      return { wrapper, originalText, typeLayer };
    };
    const heroCardTypeItems = cells.flatMap((cell, cellIndex) => {
      return [labelOf(cell), nameOf(cell)]
        .map((wrapper, lineIndex) => ({ wrapper, cellIndex, lineIndex }))
        .map(({ wrapper, cellIndex, lineIndex }) => {
          const item = createHeroCardTypeItem(wrapper);
          return item ? { ...item, cellIndex, lineIndex } : null;
        })
        .filter(Boolean);
    });
    const heroCardTypeEntries = heroCardTypeItems.map((item) => {
      const typeDuration = Math.min(0.32, Math.max(0.14, item.originalText.trim().length * 0.012));
      const steps = Math.min(24, Math.max(8, item.originalText.trim().length));
      const fallbackCardStagger = Math.abs(item.cellIndex - heroIdx) * 0.055;
      const cardStagger = heroCardTypeCardStaggers[item.cellIndex] ?? fallbackCardStagger;
      const playAt = cardStagger + item.lineIndex * heroCardTypeLineStagger;
      return { ...item, typeDuration, steps, playAt };
    });
    const heroCardTypePlayDuration = heroCardTypeEntries.reduce((end, { playAt, typeDuration }) => {
      return Math.max(end, playAt + 0.03 + typeDuration);
    }, 0);
    const heroCardTypeEnd = Math.max(
      heroGridHoldStart + heroGridHoldDuration,
      heroCardTypeStart + heroCardTypePlayDuration
    );
    // STAGE 2 — every cell's image+overlay reveal,
    // with side cards sliding inward from their side of the hero.
    cells.forEach((cell, i) => {
      const isHeroCell = cell === hero;
      if (isHeroCell) return;

      const delay   = Math.abs(i - heroIdx) * heroStage2Stagger;
      const targets = mediaContentsOf(cell).filter(Boolean);
      if (targets.length) {
        masterTl.to(targets, {
          opacity: 1,
          x: 0,
          scale: 1,
          duration: heroStage2FadeDuration,
          ease: 'power3.out'
        }, heroStage2Start + delay);
      }
    });

    if (heroCardTypeEntries.length) {
      let heroCardTypePlayed = false;
      heroCardTypeTl = gsap.timeline({ paused: true });
      heroCardTypeEntries.forEach(({ wrapper, originalText, typeLayer, typeDuration, steps, playAt }) => {
        heroCardTypeTl
          .to(wrapper, { opacity: 1, duration: 0.12, ease: 'power2.out' }, playAt)
          .to(typeLayer, {
            text: originalText,
            duration: typeDuration,
            ease: `steps(${steps})`,
            onStart: () => {
              typeLayer.textContent = '';
            },
            onComplete: () => {
              typeLayer.textContent = originalText;
            }
          }, playAt + 0.03);
      });

      const resetHeroCardType = () => {
        heroCardTypePlayed = false;
        heroCardTypeTl.pause(0);
        heroCardTypeEntries.forEach(({ wrapper, typeLayer }) => {
          gsap.set(wrapper, { opacity: 0 });
          typeLayer.textContent = '';
        });
      };
      syncHeroCardTypePlayback = () => {
        if (masterTl.time() >= heroCardTypeStart) {
          if (!heroCardTypePlayed) {
            heroCardTypePlayed = true;
            heroCardTypeTl.play(0);
          }
        } else if (heroCardTypePlayed || heroCardTypeTl.progress() > 0) {
          resetHeroCardType();
        }
      };
      resetHeroCardType();
    }
    const heroCardTextWrappers = heroCardTypeItems.map(({ wrapper }) => wrapper).filter(Boolean);

    // Hold after the final card text finishes so the exit scrub cannot overlap the read.
    masterTl.to({}, { duration: heroCardReadableHoldDuration }, heroCardTypeEnd);

    exitTl = gsap.timeline({
      scrollTrigger: {
        trigger: outer,
        start: 'bottom bottom',
        end: 'bottom top',
        scrub: true,
        invalidateOnRefresh: true,
        refreshPriority: 5,
        onLeaveBack: () => {
          if (window.heroFullscreenParallaxLock === true && resetHeroCellTransforms) {
            resetHeroCellTransforms();
          }
        }
      }
    });
    if (heroCardTextWrappers.length) {
      exitTl.to(heroCardTextWrappers, {
        opacity: 0,
        duration: 0.35,
        ease: 'none'
      }, 0);
    }
    if (svgHeader) {
      exitTl.to(svgHeader, {
        y: () => window.innerHeight * heroSvgHeaderExitDistance,
        duration: heroExitDriftDuration,
        ease: 'none'
      }, 0);
    }
    cells.forEach((cell, i) => {
      const normalizedIndex = i - heroIdx;
      const fallbackMultiplier = 0.03 + Math.abs(normalizedIndex) * 0.01;
      const driftProfile = heroCardDriftProfiles[i] || {};
      const multiplier = driftProfile.y ?? fallbackMultiplier;
      exitTl.to(cell, {
        y: () => window.innerHeight * multiplier,
        duration: heroExitDriftDuration,
        ease: 'none'
      }, 0);
    });
    requestAnimationFrame(updateHeroScrollTimelines);
  }

  let resizeTO;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTO);
    resizeTO = setTimeout(build, 200);
  });
}

// ================================================================================
// 🎬 HERO VIDEO PARALLAX (data-hero="video")
// ================================================================================
// Scroll-triggered parallax for the fixed video hero on the test homepage variant.
// As the user scrolls, the hero translates UP — same direction as page scroll —
// but only by a small fraction of the scroll distance, so the next section appears
// to slide over the hero while the hero drifts up slowly. Mirrors the lingering
// feel of the original scroll-card scrub animation, just with a static video.
//
// The trigger rides on the hero's scroll spacer (data-fixed-trigger="hero" or one
// of the equivalent attributes used by initFixedSectionSorting). The hero itself
// is position:fixed so its own bounding rect can't drive scroll progress.
//
// No-op when [data-hero="video"] is not present, so the original homepage with the
// scroll-card scrub animation is completely unaffected.
function initHeroVideoParallax() {
  const hero = document.querySelector('[data-hero="video"]');
  if (!hero) return;
  if (typeof gsap === 'undefined') return;
  if (hero.dataset.heroVideoParallaxInit === 'true') return;
  hero.dataset.heroVideoParallaxInit = 'true';

  if (typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
  }

  // Find the matching scroll spacer for the hero. Same attribute set used by
  // initFixedSectionSorting() so we stay consistent with the page's existing
  // pinned-section system.
  const spacer = document.querySelector(
    '[data-fixed-trigger="hero"], [data-section-trigger="hero"], [data-section-spacer="hero"], [data-section-scroll="hero"]'
  );
  const triggerEl = spacer || hero;

  // Translate UP by 15vh across the spacer's full scroll length. Same direction
  // as everything else, but ~15% of the scroll velocity, so the hero drifts up
  // gently while the page rises past it. scrub: 0.2 (was 0.6) — tighter tracking
  // so the video follows the scroll closely instead of lagging behind it, which
  // compounded with the smooth-scroll easing into a "resisting" feel.
  gsap.fromTo(hero,
    { y: 0 },
    {
      y: '-15vh',
      ease: 'none',
      scrollTrigger: {
        trigger: triggerEl,
        start: 'top top',
        end: 'bottom top',
        scrub: 0.2,
        invalidateOnRefresh: true,
      },
    }
  );

  console.log('🎬 Hero video parallax initialized (trigger=' + (spacer ? 'spacer' : 'hero') + ')');
}

// ================================================================================
// 🪗 ACCORDION+TABS COMBO (data-section="accordion")
// ================================================================================
// Combined Lumos accordion + tabs controller, formerly a Webflow embed. Accordion
// toggles drive the tab panels; an autoplay loop advances items via --progress on
// the .tab_wrap (the Lumos progress line reads it). Reads the same data attributes
// as the stock tab component (data-autoplay-duration, data-duration,
// data-pause-on-hover). Claims the wraps (scriptInitialized) so the stock Lumos
// tab/accordion embeds skip these sections; they keep serving the rest of the site.
//
// Behavior: one item always open; click = open + hold loop 5s, then resume;
// keyboard focus pauses the loop (focus-visible only); loop pauses off-screen and
// while the next sticky section covers this one (scanner line fades out in place,
// resumes on reveal). No-op when [data-section="accordion"] is absent.
const COMBO_RESUME_DELAY_MS = 5000;

function claimComboSections() {
  document.querySelectorAll(
    '[data-section="accordion"] .tab_wrap, [data-section="accordion"] .accordion_wrap'
  ).forEach((w) => { w.dataset.scriptInitialized = 'true'; });
}

function injectComboStyles() {
  if (document.getElementById('accordion-tabs-combo-styles')) return;
  const style = document.createElement('style');
  style.id = 'accordion-tabs-combo-styles';
  style.textContent = `
    /* Stabilize panels: hide all; pre-JS show first (no flash, no pile-up) */
    [data-section="accordion"] .tab_content_list > * { display: none; }
    [data-section="accordion"] .tab_content_list:not([data-combo-init]) > :first-child { display: block; }

    /* Positioning context so the outgoing panel can overlay the incoming one
       during the crossfade (absolute children resolve against this). */
    [data-section="accordion"] .tab_content_list { position: relative; }

    /* Accordion bodies start closed; JS animates height */
    [data-section="accordion"] .accordion_content_wrap { overflow: hidden; }

    /* Progress line on the TOP edge (items carry border-top), scanner gradient:
       bright head at the moving edge fading to transparent behind, and an
       opacity transition so the cover-pause can fade it out without rewinding. */
    [data-section="accordion"] .tab_button_line {
      inset: 0% auto auto 0%;
      transform: translate(0, -100%);
      background-color: transparent;
      /* Fixed-length trailing streak riding the progress head, NOT a gradient
         stretched across the whole fill. background-size sets the trail length;
         it sits at the right edge (the head), everything behind it transparent —
         so the indicator stays compact no matter how far along the progress is. */
      background-image: linear-gradient(90deg, transparent, currentColor);
      background-repeat: no-repeat;
      background-size: 2.5rem 100%;
      background-position: right center;
      transition: opacity 0.4s ease;
    }

    /* Progress line is LOCKED to the first item's top edge (= the start of the
       block) instead of following the active item. A jumping line over-emphasized
       the dividers; a fixed one reads purely as a timer. No extra element — we
       just reuse the first item's existing line and hide all the others. */
    [data-section="accordion"] .tab_button_line { opacity: 0 !important; }
    [data-section="accordion"] .tab_button_line.combo-progress-anchor {
      opacity: 1 !important;
      width: calc(100% * var(--progress, 0)) !important;
    }
    [data-section="accordion"] .tab_wrap.is-covered .tab_button_line.combo-progress-anchor {
      opacity: 0 !important;
    }
  `;
  document.head.appendChild(style);
}

function initAccordionTabsCombo() {
  if (typeof gsap === 'undefined') return;
  claimComboSections();
  injectComboStyles();

  document.querySelectorAll('[data-section="accordion"]').forEach((section) => {
    if (section.dataset.comboInit) return;
    section.dataset.comboInit = 'true';

    const wrap = section.querySelector('.tab_wrap') || section;
    const autoplaySecs = parseFloat(wrap.getAttribute('data-autoplay-duration')) || 0;
    const dur = parseFloat(wrap.getAttribute('data-duration')) || 0.3;
    const pauseOnHover = wrap.getAttribute('data-pause-on-hover') === 'true';
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const items = Array.from(section.querySelectorAll('.accordion_item'));
    const panelList = section.querySelector('.tab_content_list');
    const panels = panelList ? Array.from(panelList.children) : [];
    if (!items.length || !panels.length) {
      console.warn('🪗 combo: missing items/panels', section);
      return;
    }
    if (items.length !== panels.length) {
      console.warn(`🪗 combo: ${items.length} items vs ${panels.length} panels — extras ignored`);
    }
    const count = Math.min(items.length, panels.length);
    panelList.setAttribute('data-combo-init', 'true');

    let active = -1;
    const refreshST = () => { if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh(); };

    const units = items.slice(0, count).map((item, i) => {
      const btn = item.querySelector('.accordion_toggle_button');
      const content = item.querySelector('.accordion_content_wrap');
      const outer = item.closest('.tab_button_item') || item;
      if (btn && content) {
        btn.setAttribute('aria-expanded', 'false');
        btn.id = btn.id || `combo-btn-${i}`;
        content.id = content.id || `combo-content-${i}`;
        btn.setAttribute('aria-controls', content.id);
        content.setAttribute('aria-labelledby', btn.id);
        content.style.display = 'none';
      }
      let tl = null;
      if (content) {
        // Accordion timing: in-out quart (power4.inOut) — slow edges, fast snappy
        // middle, so the drawer feels dynamic rather than linear/cushioned.
        // Duration trimmed for snap.
        const accDur = Math.max(dur * 1.6, 0.4);
        tl = gsap.timeline({
          paused: true,
          defaults: { duration: accDur, ease: 'power4.inOut' },
          onComplete: refreshST,
          onReverseComplete: refreshST
        });
        tl.set(content, { display: 'block' });
        tl.fromTo(content, { height: 0 }, { height: 'auto' });
      }
      return { item, outer, btn, content, tl };
    });

    // Anchor the progress line to the first item's existing line (top of block).
    const firstLine = units[0] && units[0].outer.querySelector('.tab_button_line');
    if (firstLine) firstLine.classList.add('combo-progress-anchor');

    // Overlapping crossfade: the incoming panel fades in ON TOP of the outgoing
    // one, which stays in place and fully opaque underneath until covered. Because
    // the outgoing panel never goes transparent before the incoming is solid, the
    // section background is never exposed between items — they dissolve into each
    // other. The outgoing panel holds the layout height (stays in flow) while the
    // incoming overlays absolutely, so nothing jumps.
    const CROSSFADE = 0.22; // snappy
    function showPanel(i, prev) {
      const cur = panels[i];
      const old = panels[prev];
      if (reduced || !old || old === cur) {
        if (old && old !== cur) old.style.display = 'none';
        cur.style.display = 'block';
        cur.style.opacity = 1;
        return;
      }
      // Outgoing: stays in flow, opaque, underneath.
      gsap.set(old, { display: 'block', position: 'relative', zIndex: 1, opacity: 1 });
      // Incoming: overlays on top, starts transparent, fades in.
      gsap.set(cur, {
        display: 'block', position: 'absolute', top: 0, left: 0, width: '100%',
        zIndex: 2, opacity: 0
      });
      gsap.to(cur, {
        opacity: 1, duration: CROSSFADE, ease: 'power1.inOut',
        onComplete: () => {
          old.style.display = 'none';
          gsap.set(old, { clearProps: 'position,zIndex,opacity' });
          // Incoming returns to normal flow so it holds height for the next swap.
          gsap.set(cur, { clearProps: 'position,top,left,width,zIndex,opacity' });
          cur.style.display = 'block';
        }
      });
    }

    function activate(i, instant, fromUser) {
      if (i === active) { fromUser ? holdThenResume() : startProgress(); return; }
      const prev = active;
      active = i;
      units.forEach((u, j) => {
        const on = j === i;
        u.outer.classList.toggle('is-active', on);
        u.item.classList.toggle('is-active', on);
        if (u.btn) u.btn.setAttribute('aria-expanded', on ? 'true' : 'false');
        if (u.tl) { on ? (instant ? u.tl.progress(1) : u.tl.play()) : u.tl.reverse(); }
        else if (u.content) u.content.style.display = on ? 'block' : 'none';
      });
      showPanel(i, prev);
      fromUser ? holdThenResume() : startProgress();
    }

    // ---- autoplay loop via --progress on the wrap ----
    let progressTween = null;
    let resumeTimer = null;
    let hovered = false;
    let focused = false;
    let inView = true;
    let covered = false;

    function canRun() {
      return autoplaySecs > 0 && !reduced && inView && !hovered && !focused && !covered;
    }
    function startProgress() {
      clearTimeout(resumeTimer);
      if (progressTween) progressTween.kill();
      if (!canRun()) { wrap.style.setProperty('--progress', 0); return; }
      progressTween = gsap.fromTo(wrap, { '--progress': 0 }, {
        '--progress': 1,
        ease: 'none',
        duration: autoplaySecs,
        onComplete: () => { activate((active + 1) % count); }
      });
    }
    // User clicked: hold the loop, then resume from zero.
    function holdThenResume() {
      clearTimeout(resumeTimer);
      if (progressTween) progressTween.kill();
      wrap.style.setProperty('--progress', 0);
      resumeTimer = setTimeout(startProgress, COMBO_RESUME_DELAY_MS);
    }
    function updateAuto() {
      if (canRun()) startProgress();
      else if (progressTween) progressTween.pause();
    }

    units.forEach((u, i) => {
      u.outer.addEventListener('click', () => { activate(i, false, true); });
      u.outer.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); activate((active + 1) % count, false, true); }
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); activate((active - 1 + count) % count, false, true); }
      });
    });
    if (pauseOnHover) {
      wrap.addEventListener('mouseenter', () => { hovered = true; updateAuto(); });
      wrap.addEventListener('mouseleave', () => { hovered = false; updateAuto(); });
    }
    // Pause only for KEYBOARD focus (:focus-visible) — mouse clicks shouldn't
    // permanently kill the loop; they trigger the hold instead.
    wrap.addEventListener('focusin', (e) => {
      focused = e.target.matches(':focus-visible');
      updateAuto();
    });
    wrap.addEventListener('focusout', (e) => {
      if (!e.relatedTarget || !wrap.contains(e.relatedTarget)) { focused = false; updateAuto(); }
    });
    new IntersectionObserver((entries) => {
      inView = entries[0].isIntersecting;
      updateAuto();
    }, { threshold: 0 }).observe(wrap);

    // ---- stop the loop while the NEXT sticky section covers this one ----
    // Freeze progress in place and FADE the line out via the is-covered class
    // (rewinding the width reads as "reversing"). Fires once the incoming
    // section is 25% into the viewport; on reveal the line fades back in and
    // the loop restarts from zero while still transparent (no visible jump).
    const stickySections = Array.from(document.querySelectorAll('.u-section.u-position-sticky'));
    const selfIdx = stickySections.indexOf(section);
    const nextSection = selfIdx >= 0 ? (stickySections[selfIdx + 1] || null) : null;
    if (nextSection) {
      new IntersectionObserver((entries) => {
        const nowCovered = entries[0].isIntersecting;
        if (nowCovered === covered) return;
        covered = nowCovered;
        if (covered) {
          clearTimeout(resumeTimer);
          if (progressTween) progressTween.pause();   // freeze — CSS fades the line
          wrap.classList.add('is-covered');
        } else {
          wrap.classList.remove('is-covered');        // fades back in
          startProgress();                            // fresh cycle from zero
        }
      }, { threshold: 0, rootMargin: '0px 0px -25% 0px' }).observe(nextSection);
    }

    activate(0, true);   // first item open, first panel shown, loop starts
    console.log('🪗 combo: initialized', count, 'items');
  });
}

// Claim combo sections at script-execution time. animations.js loads in the
// footer (after the sections), while the stock Lumos embeds register
// DOMContentLoaded listeners during parse — claiming synchronously here wins
// the race regardless of listener order.
try { claimComboSections(); } catch (e) { /* DOM not ready in exotic loads */ }

// ================================================================================
// ⌨️ HERO TYPE SEQUENCE (data-type-sequence="Phrase one|Phrase two")
// ================================================================================
// One-shot typewriter sequence for hero headlines:
//   1. starts EMPTY (styles injected at script execution hide the wrapper so the
//      full text never flashes before the animation),
//   2. types the first phrase,
//   3. holds (data-type-hold seconds, default 3),
//   4. morphs to the next phrase: backspaces to the common beginning of the two
//      phrases, then types the differing rest. "Reactive Dynamics|Reactive Squad"
//      keeps "Reactive ", deletes "Dynamics", types "Squad".
// Multiple phrases allowed (a|b|c). Final phrase stays. Reduced motion shows the
// final phrase immediately. Plain textContent typing — no SplitText/CDN wait, so
// it starts instantly and there is no FOUC window.
function injectTypeSequenceStyles() {
  if (document.getElementById('hero-type-sequence-styles')) return;
  const style = document.createElement('style');
  style.id = 'hero-type-sequence-styles';
  style.textContent = '[data-type-sequence] { visibility: hidden; }';
  document.head.appendChild(style);
}

function initHeroTypeSequence() {
  const wrappers = Array.from(document.querySelectorAll('[data-type-sequence]'));
  if (wrappers.length === 0) return;
  injectTypeSequenceStyles();

  const TYPE_MS = 45;          // per character while typing
  const DELETE_MS = 28;        // per character while deleting (faster, like real backspace)
  const START_DELAY_MS = 350;  // small beat after reveal before typing starts

  wrappers.forEach((wrapper) => {
    if (wrapper.dataset.typeSequenceInit === 'true') return;
    wrapper.dataset.typeSequenceInit = 'true';

    const target = wrapper.querySelector('h1, h2, h3, h4, h5, h6, p, [data-text-target]') || wrapper;
    const phrases = (wrapper.getAttribute('data-type-sequence') || '')
      .split('|').map((s) => s.trim()).filter(Boolean);
    const holdMs = (parseFloat(wrapper.getAttribute('data-type-hold')) || 3) * 1000;

    if (phrases.length === 0) {
      wrapper.style.visibility = 'visible';
      return;
    }

    // Reserve one line of height so the empty heading doesn't collapse and
    // shift the layout when typing begins.
    target.style.minHeight = '1lh';
    target.textContent = '';
    wrapper.style.visibility = 'visible';

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      target.textContent = phrases[phrases.length - 1];
      return;
    }

    let current = '';
    let timer = null;
    const setText = (t) => { target.textContent = t; };

    const commonPrefixLen = (a, b) => {
      let n = 0;
      const m = Math.min(a.length, b.length);
      while (n < m && a[n] === b[n]) n++;
      return n;
    };
    const typeOut = (toStr, done) => {
      if (current.length < toStr.length) {
        current = toStr.slice(0, current.length + 1);
        setText(current);
        timer = setTimeout(() => typeOut(toStr, done), TYPE_MS);
      } else done();
    };
    const deleteTo = (len, done) => {
      if (current.length > len) {
        current = current.slice(0, -1);
        setText(current);
        timer = setTimeout(() => deleteTo(len, done), DELETE_MS);
      } else done();
    };
    const run = (idx) => {
      const phrase = phrases[idx];
      deleteTo(commonPrefixLen(current, phrase), () => {
        typeOut(phrase, () => {
          if (idx < phrases.length - 1) {
            timer = setTimeout(() => run(idx + 1), holdMs);
          }
        });
      });
    };

    timer = setTimeout(() => run(0), START_DELAY_MS);
  });
}

// Hide sequence headlines immediately at script execution — before first paint
// of anything below the footer scripts — so the full text never flashes.
try { injectTypeSequenceStyles(); } catch (e) { /* DOM not ready in exotic loads */ }

// ================================================================================
// ⌨️ HERO TYPE BUILD (data-type-build="Sentence one.|Sentence two.|Sentence three.")
// ================================================================================
// Accumulating typewriter for hero copy: types the phrases one after another into
// a single growing paragraph, pausing at each sentence boundary, ending on the
// full text. Starts EMPTY (visibility hidden injected at script execution, so the
// full text never flashes). When typing finishes, any [data-hero-reveal] elements
// fade in ("then the rest fades in").
//
// Pipeline the user described:
//   1. black hero curtain  (existing hero curtain — untouched here)
//   2. text types in       (this function)
//   3. the rest fades in    ([data-hero-reveal] elements)
//
// Attributes:
//   data-type-build  = phrases joined with "|" (typed in order, space-joined)
//   data-type-hold   = seconds to pause at each sentence boundary (default 0.7)
//   data-type-start  = seconds to wait before the first character (default 0.5)
// No-op when data-type-build is absent.
function injectTypeBuildStyles() {
  if (document.getElementById('hero-type-build-styles')) return;
  const style = document.createElement('style');
  style.id = 'hero-type-build-styles';
  // Hide the headline (until JS empties + reveals it) and pre-hide the rest so
  // it doesn't show before the typing completes.
  style.textContent = '[data-type-build] { visibility: hidden; } [data-hero-reveal] { opacity: 0; }';
  document.head.appendChild(style);
}

function initTypeBuild() {
  const wrappers = Array.from(document.querySelectorAll('[data-type-build]'));
  if (wrappers.length === 0) return;
  injectTypeBuildStyles();

  const TYPE_MS = 55;   // per character typing (slower, readable)
  const DELETE_MS = 28; // per character deleting (quicker backspace)
  const G = typeof gsap !== 'undefined';

  wrappers.forEach((wrapper) => {
    if (wrapper.dataset.typeBuildInit === 'true') return;
    wrapper.dataset.typeBuildInit = 'true';

    const target = wrapper.querySelector('h1, h2, h3, h4, h5, h6, p, [data-text-target]') || wrapper;
    const phrases = (wrapper.getAttribute('data-type-build') || '')
      .split('|').map((s) => s.trim()).filter(Boolean);
    const holdMs = (parseFloat(wrapper.getAttribute('data-type-hold')) || 1.8) * 1000;
    const startMs = (parseFloat(wrapper.getAttribute('data-type-start')) || 0.5) * 1000;
    // Seconds between the post-sequence stages (background → rest).
    const gapMs = (parseFloat(wrapper.getAttribute('data-stage-gap')) || 1.5) * 1000;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---- Hero page-load staging elements (all optional) ----
    const curtain = document.querySelector('[data-hero-curtain], .hero_curtain');
    const bg = document.querySelector('[data-hero-bg]');
    const restEls = Array.from(document.querySelectorAll('[data-hero-reveal]'));
    const hasStaging = !!(curtain || bg || restEls.length);

    console.log('🎬 type-build init:', {
      phrases: phrases.length,
      curtainFound: !!curtain,
      curtainClass: curtain ? curtain.className.slice(0, 50) : null,
      curtainOpacityBefore: curtain ? getComputedStyle(curtain).opacity : null,
      curtainZ: curtain ? getComputedStyle(curtain).zIndex : null,
      bgFound: !!bg,
      restCount: restEls.length
    });

    const fadeIn = (els, dur, stagger) => {
      const arr = Array.isArray(els) ? els : (els ? [els] : []);
      if (arr.length === 0) return;
      if (G) gsap.to(arr, { autoAlpha: 1, opacity: 1, duration: dur, ease: 'power2.out', stagger: stagger || 0 });
      else arr.forEach((el) => { el.style.transition = `opacity ${dur}s ease`; el.style.opacity = 1; });
    };
    const fadeOut = (el, dur) => {
      if (!el) return;
      if (G) gsap.to(el, { autoAlpha: 0, duration: dur, ease: 'power2.inOut' });
      else { el.style.transition = `opacity ${dur}s ease`; el.style.opacity = 0; }
    };

    // Stage 2 (after the FIRST phrase): the dark screen gives way — background
    // fades in (and any literal curtain lifts). Stage 3 (after the LAST phrase):
    // everything else fades in.
    let bgRevealed = false;
    const stageBackground = () => {
      if (bgRevealed) return;
      bgRevealed = true;
      fadeOut(curtain, 1.1);
      fadeIn(bg, 1.1);
    };
    const stageRest = () => { fadeIn(restEls, 0.8, 0.08); };
    const runStaging = () => {
      stageBackground();
      if (restEls.length) setTimeout(stageRest, gapMs);
    };

    if (phrases.length === 0) {
      wrapper.style.visibility = 'visible';
      runStaging();
      return;
    }

    // ---- Stable sizing: build two overlaid layers inside the heading so the
    // text NEVER reflows while typing (critical with a max-width). A hidden
    // "sizer" span holds the current phrase and sizes the box; an absolutely
    // positioned "typed" span shows the characters typed so far on top of it.
    // The heading's own display/line-height-trim is untouched (no display:grid).
    target.style.position = 'relative';
    target.textContent = '';
    const sizer = document.createElement('span');
    sizer.setAttribute('aria-hidden', 'true');
    sizer.style.visibility = 'hidden';
    sizer.style.whiteSpace = 'pre-wrap';
    const typed = document.createElement('span');
    typed.setAttribute('aria-hidden', 'true');
    typed.style.position = 'absolute';
    typed.style.top = '0';
    typed.style.left = '0';
    typed.style.right = '0';
    typed.style.whiteSpace = 'pre-wrap';
    target.appendChild(sizer);
    target.appendChild(typed);

    // Reserve the tallest phrase's height up front, so the box doesn't jump
    // vertically when phrases of different line-counts swap in.
    let maxH = 0;
    phrases.forEach((p) => { sizer.textContent = p; maxH = Math.max(maxH, target.offsetHeight); });
    target.style.minHeight = maxH + 'px';
    sizer.textContent = phrases[0];
    typed.textContent = '';
    wrapper.style.visibility = 'visible';

    // Curtain BLACK at start (it sits behind the text). initTypeBuild owns it —
    // set it explicitly so it doesn't depend on the hero-intro gate firing.
    if (curtain && G) {
      gsap.set(curtain, { autoAlpha: 1, pointerEvents: 'none' });
      // What is painted on top of the curtain's center? (Is the bg covering it?)
      const cb = curtain.getBoundingClientRect();
      const topEl = document.elementFromPoint(
        Math.max(0, Math.min(window.innerWidth - 1, cb.x + cb.width / 2)),
        Math.max(0, Math.min(window.innerHeight - 1, cb.y + cb.height / 2))
      );
      console.log('🎬 curtain set black → opacity now', getComputedStyle(curtain).opacity,
        '| painted on top at center:', topEl ? topEl.tagName + '.' + [...topEl.classList].slice(0, 3).join('.') : null);
    }
    // Background hidden at start; fades in after the first phrase.
    if (bg && G) gsap.set(bg, { autoAlpha: 0 });

    if (reduced) {
      sizer.style.visibility = 'visible';
      sizer.textContent = phrases[phrases.length - 1];
      typed.remove();
      runStaging();
      return;
    }

    // ---- MORPH sequence: from the current text, delete back only to the COMMON
    // beginning of the next phrase, then type the rest. A shared prefix stays put
    // (e.g. "Reactive Squad." persists while the suffix after it cycles); phrases
    // that share no start fully erase and retype. Hold (read) between phrases;
    // the last phrase stays, then staging runs.
    const commonPrefixLen = (a, b) => {
      let n = 0;
      const m = Math.min(a.length, b.length);
      while (n < m && a[n] === b[n]) n += 1;
      return n;
    };
    let current = '';
    const typeTo = (str, done) => {
      if (current.length < str.length) {
        current = str.slice(0, current.length + 1);
        typed.textContent = current;
        setTimeout(() => typeTo(str, done), TYPE_MS);
      } else done();
    };
    const deleteTo = (len, done) => {
      if (current.length > len) {
        current = current.slice(0, -1);
        typed.textContent = current;
        setTimeout(() => deleteTo(len, done), DELETE_MS);
      } else done();
    };
    const runPhrase = (idx) => {
      const phrase = phrases[idx];
      // Size the box to the longer of current/target so neither phase reflows.
      sizer.textContent = phrase.length >= current.length ? phrase : current;
      deleteTo(commonPrefixLen(current, phrase), () => {
        sizer.textContent = phrase;
        typeTo(phrase, () => {
          // After the first phrase ("Reactive Squad."): the dark screen lifts —
          // background fades in while the rest of the sequence continues.
          if (idx === 0) setTimeout(stageBackground, holdMs);
          if (idx < phrases.length - 1) setTimeout(() => runPhrase(idx + 1), holdMs);
          else setTimeout(stageRest, holdMs); // last phrase stays → reveal the rest
        });
      });
    };
    setTimeout(() => runPhrase(0), startMs);
  });
}

// Pre-hide build headlines + their reveal targets at script execution.
try { injectTypeBuildStyles(); } catch (e) { /* DOM not ready in exotic loads */ }

// ================================================================================
// 🏞️ BACKGROUND IMAGE PARALLAX (data-img="background")
// ================================================================================
// Full-bleed cover backgrounds scroll slightly slower than the page. The image is
// scaled up a touch so the parallax shift never exposes an edge, then translated
// from -7% to +7% as its section passes through the viewport (scrubbed to scroll).
// No-op when [data-img="background"] is absent.
// ================================================================================
// ▶️ FORCE VIDEO AUTOPLAY ON MOBILE (video[autoplay])
// ================================================================================
// iOS autoplay checks the muted *property*, not just the attribute — Lumos sets
// muted="" as an attribute, which doesn't reliably reflect to the property at
// play time, so iOS blocks autoplay and shows a play button. Set the property
// explicitly (+ legacy webkit-playsinline) and call play(); retry on the first
// user interaction in case the browser blocked the initial attempt.
function initForceVideoAutoplay() {
  const vids = Array.from(document.querySelectorAll('video[autoplay]'));
  if (vids.length === 0) return;

  const prep = (v) => {
    v.muted = true;          // the property iOS actually checks
    v.defaultMuted = true;
    v.setAttribute('muted', '');
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
  };
  const tryPlay = (v) => {
    const p = v.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  };

  vids.forEach((v) => {
    if (v.dataset.forceAutoplayInit === 'true') return;
    v.dataset.forceAutoplayInit = 'true';
    prep(v);
    tryPlay(v);
    v.addEventListener('loadeddata', () => tryPlay(v), { once: true });
    v.addEventListener('canplay', () => tryPlay(v), { once: true });
  });

  // Last-resort: if a browser still blocked it, kick all of them off the first
  // user gesture (a tap/scroll counts as interaction and unblocks playback).
  const kick = () => {
    vids.forEach((v) => { if (v.paused) tryPlay(v); });
    window.removeEventListener('touchstart', kick);
    window.removeEventListener('scroll', kick);
    window.removeEventListener('click', kick);
  };
  window.addEventListener('touchstart', kick, { passive: true, once: true });
  window.addEventListener('scroll', kick, { passive: true, once: true });
  window.addEventListener('click', kick, { once: true });

  console.log('▶️ force-video-autoplay: prepared', vids.length, 'video(s)');
}

// ================================================================================
// 📌 HEADROOM NAV (.nav_component) — pin on scroll up, hide on scroll down
// ================================================================================
// Uses Headroom.js (already loaded on the page) to toggle classes by scroll
// direction; the injected CSS does the show/hide transform. The nav stays
// position:fixed; Headroom just slides it up out of view when scrolling down and
// back in when scrolling up. No-op if .nav_component is absent.
function loadHeadroomOnce() {
  return new Promise((resolve, reject) => {
    if (typeof Headroom !== 'undefined') { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/headroom.js@0.12.0/dist/headroom.min.js';
    s.onload = () => (typeof Headroom !== 'undefined' ? resolve() : reject('Headroom missing after load'));
    s.onerror = () => reject('Failed to load Headroom');
    document.head.appendChild(s);
  });
}

function injectHeadroomNavStyles() {
  if (document.getElementById('headroom-nav-styles')) return;
  const style = document.createElement('style');
  style.id = 'headroom-nav-styles';
  style.textContent = `
    .nav_component { transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1); will-change: transform; }
    .nav_component.headroom--unpinned { transform: translateY(-100%); }
    .nav_component.headroom--pinned { transform: translateY(0%); }
  `;
  document.head.appendChild(style);
}

function initHeadroomNav() {
  const nav = document.querySelector('.nav_component');
  if (!nav || nav.dataset.headroomInit === 'true') return;
  injectHeadroomNavStyles();
  loadHeadroomOnce().then(() => {
    if (nav.dataset.headroomInit === 'true' || typeof Headroom === 'undefined') return;
    nav.dataset.headroomInit = 'true';
    const hr = new Headroom(nav, {
      tolerance: 6,   // ignore tiny scroll jitters
      offset: 80      // don't hide until scrolled 80px past the top
    });
    hr.init();
    nav._headroom = hr;
    console.log('📌 headroom nav initialized');
  }).catch((err) => console.error('📌 headroom:', err));
}

function initBackgroundParallax() {
  if (typeof gsap === 'undefined') return;
  const sections = Array.from(document.querySelectorAll('[data-img="background"]'));
  if (sections.length === 0) return;

  const SHIFT = 7;   // % of the image height it drifts each way
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  loadScrollTriggerOnce().then(() => {
    let count = 0;
    sections.forEach((host) => {
      if (host.dataset.bgParallaxInit === 'true') return;
      host.dataset.bgParallaxInit = 'true';

      // The [data-img="background"] element wraps the full-bleed background image.
      // Target ONLY ONE image — the primary background — not every image inside
      // (that would parallax unrelated content images too). Prefer one inside a
      // cover layer, else the first image/video in the wrapper.
      const img = host.querySelector('.u-cover-absolute .u-image, .u-cover-absolute img, .u-cover-absolute video')
        || host.querySelector('.u-image, img, .u-video, video');
      if (!img) {
        console.warn('🏞️ background parallax: no image found inside', host);
        return;
      }

      // The parallax scrub follows the nearest real (box-generating) ancestor
      // section/scroll context, since data-img often sits on a display:contents
      // wrapper that has no box of its own.
      const trigger = host.closest('section') || (getComputedStyle(host).display === 'contents'
        ? host.parentElement : host) || host;

      // Clip the wrapper so the ±7% drift + 1.18 scale never exposes an edge.
      const wrap = img.parentElement;
      if (wrap && getComputedStyle(wrap).overflow === 'visible') wrap.style.overflow = 'hidden';
      gsap.set(img, { scale: 1.18, transformOrigin: 'center center', willChange: 'transform' });
      gsap.fromTo(img,
        { yPercent: -SHIFT },
        {
          yPercent: SHIFT,
          ease: 'none',
          scrollTrigger: {
            trigger,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
            invalidateOnRefresh: true,
          },
        }
      );
      count += 1;
    });
    console.log('🏞️ background parallax: initialized', count, 'images in', sections.length, 'sections');
  }).catch((err) => console.error('🏞️ background parallax:', err));
}

// ================================================================================
// 🃏 STICKY SECTION OVERLAYS (sticky-section="wrapper" + data-overlay)
// ================================================================================
// Stacked-cards dimming: inside a wrapper marked sticky-section="wrapper", each
// section that scrolls up over the previous (sticky) one drives the PREVIOUS
// section's [data-overlay] element from opacity 0 → 0.8, scrubbed to the overlap.
//
// Scroll mapping per incoming section: 'top bottom' → 'top top'. That is exactly
// the window during which the incoming section covers the stuck previous section,
// so the dim tracks the physical overlap 1:1.
//
// No-op when the attribute isn't present, so other pages are unaffected.
function initStickySectionOverlays() {
  if (typeof gsap === 'undefined') return;

  const wrappers = Array.from(document.querySelectorAll(
    '[sticky-section="wrapper"], [data-sticky-section="wrapper"]'
  ));
  if (wrappers.length === 0) return;

  // Lumos component attribute slots land on display:contents wrappers, which
  // generate no box (zero rect, opacity has no effect). Resolve down to the
  // first descendant that actually paints. Same pattern as initFixedSectionSorting.
  const resolveVisual = (el) => {
    let visual = el;
    while (visual && window.getComputedStyle(visual).display === 'contents') {
      visual = visual.firstElementChild;
    }
    return visual || el;
  };

  loadScrollTriggerOnce().then(() => {
    wrappers.forEach((wrapper) => {
      if (wrapper.dataset.stickyOverlayInit === 'true') return;
      wrapper.dataset.stickyOverlayInit = 'true';

      // Section discovery, most explicit first:
      // 1. tagged sticky-section="section" (any depth)
      // 2. Lumos sticky sections (.u-section.u-position-sticky) — no tagging
      //    needed, useful when the section's attribute slots are already used
      // 3. the wrapper's direct children
      let sections = Array.from(wrapper.querySelectorAll(
        '[sticky-section="section"], [data-sticky-section="section"]'
      ));
      if (sections.length === 0) {
        sections = Array.from(wrapper.querySelectorAll('.u-section.u-position-sticky'));
      }
      if (sections.length === 0) {
        sections = Array.from(wrapper.children).filter((el) => el.nodeType === 1);
      }
      if (sections.length < 2) {
        console.warn('🃏 sticky-overlays: need at least 2 sections (tag them sticky-section="section")', wrapper);
        return;
      }

      sections.forEach((incomingRoot, i) => {
        if (i === 0) return; // the first section has nothing above it to dim
        const overlayRoot = sections[i - 1].querySelector('[data-overlay]');
        if (!overlayRoot) {
          console.warn('🃏 sticky-overlays: section', i - 1, 'has no [data-overlay] — skipping its dim');
          return;
        }
        const overlay = resolveVisual(overlayRoot);   // paintable element
        const incoming = resolveVisual(incomingRoot); // trigger needs a real box

        // Overlay should never intercept interaction with the section beneath it.
        overlay.style.pointerEvents = 'none';

        gsap.fromTo(overlay,
          { opacity: 0 },
          {
            opacity: 0.9,
            ease: 'none',
            scrollTrigger: {
              trigger: incoming,
              start: 'top bottom',
              end: 'top top',
              scrub: true,
              invalidateOnRefresh: true,
            },
          }
        );
      });

      console.log('🃏 sticky-overlays: initialized', sections.length, 'sections');
    });
  }).catch((err) => console.error('🃏 sticky-overlays:', err));
}

// Try to start auto-scroll if DOM is already loaded (for direct page loads)
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  console.log('📄 DOM already ready, initializing standalone auto-scroll...');
  initStandaloneAutoScroll();
  initLandingScrollOpacity();
  initMarquee();
  initTextType();
  initRadialOverlay();
  initLidarScanners();
  initHeroAnimation();
  initHeroVideoParallax();
  initFixedSectionSorting();
  initScrubTypeText();
  initHeaderTypeText();
  initStickySectionOverlays();
  initAccordionTabsCombo();
  initHeroTypeSequence();
  initTypeBuild();
  initBackgroundParallax();
  initHeadroomNav();
  initForceVideoAutoplay();
} else {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM Content Loaded (standalone), initializing auto-scroll...');
    initStandaloneAutoScroll();
    initLandingScrollOpacity();
    initMarquee();
    initTextType();
    initRadialOverlay();
    initLidarScanners();
    initHeroAnimation();
    initHeroVideoParallax();
    initFixedSectionSorting();
    initScrubTypeText();
    initHeaderTypeText();
    initStickySectionOverlays();
    initAccordionTabsCombo();
    initHeroTypeSequence();
    initTypeBuild();
    initBackgroundParallax();
    initHeadroomNav();
    initForceVideoAutoplay();
  });
}
