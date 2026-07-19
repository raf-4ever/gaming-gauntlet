(function(){
  "use strict";

  /* ---------- Mobile nav ---------- */
  var navToggle = document.getElementById('navToggle');
  var navLinks = document.getElementById('navLinks');
  navToggle.addEventListener('click', function(){
    var open = navLinks.classList.toggle('is-open');
    navToggle.classList.toggle('is-open', open);
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  navLinks.querySelectorAll('a').forEach(function(a){
    a.addEventListener('click', function(){
      navLinks.classList.remove('is-open');
      navToggle.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded','false');
    });
  });

  /* ---------- Scroll progress ---------- */
  var progressBar = document.getElementById('scrollProgress');
  function updateProgress(){
    var h = document.documentElement;
    var scrollTop = h.scrollTop || document.body.scrollTop;
    var scrollHeight = (h.scrollHeight || document.body.scrollHeight) - h.clientHeight;
    var pct = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
    progressBar.style.width = pct + '%';
  }
  window.addEventListener('scroll', updateProgress, { passive:true });
  updateProgress();

  /* ---------- Scroll reveal ---------- */
  var revealEls = document.querySelectorAll('[data-reveal]');
  if('IntersectionObserver' in window){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold:0.15, rootMargin:'0px 0px -8% 0px' });
    revealEls.forEach(function(el){ io.observe(el); });
  } else {
    revealEls.forEach(function(el){ el.classList.add('is-visible'); });
  }

  /* ---------- Counters ---------- */
  function animateCounter(el){
    var target = parseInt(el.getAttribute('data-count'), 10) || 0;
    var prefix = el.getAttribute('data-prefix') || '';
    var duration = 1100;
    var start = null;
    function tick(ts){
      if(start === null) start = ts;
      var progress = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = prefix + Math.round(eased * target);
      if(progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  var counters = document.querySelectorAll('[data-count]');
  if('IntersectionObserver' in window){
    var ioCount = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          animateCounter(entry.target);
          ioCount.unobserve(entry.target);
        }
      });
    }, { threshold:0.6 });
    counters.forEach(function(el){ ioCount.observe(el); });
  } else {
    counters.forEach(function(el){
      el.textContent = (el.getAttribute('data-prefix')||'') + el.getAttribute('data-count');
    });
  }

  /* ---------- Tilt cards (fine pointer only) ---------- */
  if(window.matchMedia('(hover: hover) and (pointer: fine)').matches){
    document.querySelectorAll('.tilt-card').forEach(function(card){
      card.addEventListener('mousemove', function(e){
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5;
        var y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = 'perspective(800px) rotateX(' + (-y*10) + 'deg) rotateY(' + (x*10) + 'deg) translateY(-4px)';
      });
      card.addEventListener('mouseleave', function(){
        card.style.transform = '';
      });
    });
  }

  /* ---------- Three.js ambient scene ---------- */
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canvas = document.getElementById('bg-canvas');

  if(window.THREE && canvas){
    var THREE = window.THREE;
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = window.innerWidth < 500 ? 29 : 24;

    var renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);

    var coreGroup = new THREE.Group();

    var outerGeo = new THREE.IcosahedronGeometry(7, 1);
    var outerEdges = new THREE.EdgesGeometry(outerGeo);
    var outerWire = new THREE.LineSegments(outerEdges, new THREE.LineBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.55 }));
    coreGroup.add(outerWire);

    var innerGeo = new THREE.IcosahedronGeometry(5, 0);
    var innerMat = new THREE.MeshStandardMaterial({
      color: 0x1a0a2e, emissive: 0xaa00ff, emissiveIntensity: 0.55,
      flatShading: true, transparent: true, opacity: 0.88, metalness: 0.35, roughness: 0.45
    });
    var innerMesh = new THREE.Mesh(innerGeo, innerMat);
    coreGroup.add(innerMesh);

    var coreLight = new THREE.PointLight(0x00d4ff, 2.2, 34);
    coreGroup.add(coreLight);

    scene.add(coreGroup);

    scene.add(new THREE.AmbientLight(0x40405f, 1.1));
    var dirLight = new THREE.DirectionalLight(0xffffff, 0.55);
    dirLight.position.set(5, 8, 6);
    scene.add(dirLight);

    var satColors = [0x00d4ff, 0xaa00ff, 0xff3399, 0xffd700, 0xff7700, 0x3ddc73];
    var satellites = satColors.map(function(color, i){
      var geo = new THREE.SphereGeometry(0.32, 12, 12);
      var mat = new THREE.MeshBasicMaterial({ color: color });
      var mesh = new THREE.Mesh(geo, mat);
      scene.add(mesh);
      return {
        mesh: mesh,
        radius: 9.5 + (i % 2) * 1.3,
        speed: 0.14 + i * 0.025,
        offset: (i / satColors.length) * Math.PI * 2,
        tilt: ((i % 3) - 1) * 1.4
      };
    });

    var particleCount = window.innerWidth < 768 ? 260 : 620;
    var positions = new Float32Array(particleCount * 3);
    var colors = new Float32Array(particleCount * 3);
    var palette = [[0,212,255],[170,0,255],[255,51,153],[255,215,0]];
    for(var i = 0; i < particleCount; i++){
      positions[i*3]   = (Math.random() - 0.5) * 90;
      positions[i*3+1] = (Math.random() - 0.5) * 90;
      positions[i*3+2] = (Math.random() - 0.5) * 60 - 8;
      var c = palette[Math.floor(Math.random() * palette.length)];
      colors[i*3] = c[0]/255; colors[i*3+1] = c[1]/255; colors[i*3+2] = c[2]/255;
    }
    var particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    var particleMat = new THREE.PointsMaterial({
      size: 0.32, vertexColors: true, transparent: true, opacity: 0.65,
      sizeAttenuation: true, blending: THREE.AdditiveBlending, depthWrite: false
    });
    var particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    var mouseX = 0, mouseY = 0;
    window.addEventListener('mousemove', function(e){
      mouseX = (e.clientX / window.innerWidth) - 0.5;
      mouseY = (e.clientY / window.innerHeight) - 0.5;
    }, { passive:true });

    var isVisible = true;
    document.addEventListener('visibilitychange', function(){ isVisible = !document.hidden; });

    var clock = new THREE.Clock();
    function animate(){
      requestAnimationFrame(animate);
      if(!isVisible) return;
      var t = clock.getElapsedTime();

      coreGroup.rotation.y = t * 0.15 + mouseX * 0.5;
      coreGroup.rotation.x = mouseY * 0.3;
      outerWire.rotation.y = -t * 0.08;

      satellites.forEach(function(s){
        var angle = t * s.speed + s.offset;
        s.mesh.position.set(
          Math.cos(angle) * s.radius,
          Math.sin(angle * 0.6) * s.tilt,
          Math.sin(angle) * s.radius
        );
      });

      particles.rotation.y = t * 0.02;
      particles.rotation.x = t * 0.01;

      renderer.render(scene, camera);
    }

    if(reduceMotion){
      renderer.render(scene, camera);
    } else {
      animate();
    }

    window.addEventListener('resize', function(){
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      if(reduceMotion) renderer.render(scene, camera);
    });
  }

})();
