// ══════════ الكلام (عدّل هنا) ══════════
// t = عدد اللفّات اللي لازم تتلفّ عشان الرسالة تتفتح
const MSGS = [
  { t: 0.25, text: 'شفتي؟ الدنيا بتلف…\nوالإبرة لسه عليكِ 💗' },
  { t: 1,    text: 'لفّة كاملة… ولسه بتشاور عليكِ 🧭' },
  { t: 2,    text: 'مهما لفّيتي، قلبي بيمشي وراكِ.' },
  { t: 4,    text: 'الشغل والتعب والامتحانات والزعل…\nكلهم بيلفّوا. وأنا ثابت عليكِ.' },
  { t: 6,    text: 'بوصلتي مش بتتوه،\nعشان من أول يوم هي بتشاور عليكِ.' },
  { t: 10,   text: 'عشر لفّات! 😄\nإنتِ مش بتزهقي؟ وأنا كمان مش هزهق.\nبحبك يا ملك. 💗', final: true },
];
// الحاجات اللي بتلف حوالين الإبرة (8 اتجاهات)
const DISTRACTIONS = [
  ['💼', 'الشغل'], ['🌍', 'الدنيا'], ['😮‍💨', 'التعب'], ['🌧️', 'الزعل'],
  ['📚', 'الامتحانات'], ['⏳', 'الوقت'], ['🚗', 'الزحمة'], ['☁️', 'الهموم'],
];

// ══════════ دوال صافية (اتختبرت) ══════════
const TAU = Math.PI * 2;
function wrap(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }     // أقصر فرق زاوية (−π..π)
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
// اتجاه الموبايل بالدرجات (0 = شمال، مع عقارب الساعة) من حدث الحساسات
function headingFromEvent(e) {
  if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) return e.webkitCompassHeading;
  if (typeof e.alpha === 'number' && !Number.isNaN(e.alpha)) return (360 - e.alpha) % 360;
  return null;
}
function messageIndexFor(turns) { let idx = -1; MSGS.forEach((m, i) => { if (turns >= m.t) idx = i; }); return idx; }

// ══════════ العناصر ══════════
const $ = id => document.getElementById(id);
const stage = $('stage'), cv = $('compass'), ctx = cv.getContext('2d');
const turnsEl = $('turns'), msgEl = $('msg'), noteEl = $('note'), chipsEl = $('chips');
const btnSpin = $('btn-spin'), btnSensor = $('btn-sensor');

function load(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

// ══════════ الحالة ══════════
let size = 0, dpr = 1;
let ring = 0, prevRing = 0, omega = 0;       // زاوية الحلقة (راديان) وسرعتها
let ringTarget = 0, sensorOn = false, gotSensor = false, absoluteSeen = false;
let dragging = false, lastAng = 0, lastMoveT = 0;
let totalRot = 0, wobble = 0, avSmooth = 0, shownIdx = -1;
let streamT = 0, stream = [], clock = 0;
let record = load('malak_compass_turns', 0);   // أكتر لفّات اتلفّت قبل كده

function fit() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  size = stage.clientWidth || 380;
  cv.width = Math.round(size * dpr); cv.height = Math.round(size * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', fit);

// ══════════ السحب بالإصبع / الماوس ══════════
function ptAngle(e) {
  const r = cv.getBoundingClientRect();
  return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
}
cv.addEventListener('pointerdown', e => {
  if (sensorOn) return;
  dragging = true; omega = 0; lastAng = ptAngle(e); lastMoveT = e.timeStamp || 0;
  if (cv.setPointerCapture) { try { cv.setPointerCapture(e.pointerId); } catch (err) {} }
});
cv.addEventListener('pointermove', e => {
  if (!dragging) return;
  const a = ptAngle(e), d = wrap(a - lastAng), dt = Math.max(0.001, ((e.timeStamp || 0) - lastMoveT) / 1000);
  ring += d; lastAng = a; lastMoveT = e.timeStamp || 0;
  omega = clamp(d / dt, -22, 22);
});
const endDrag = () => { dragging = false; };
cv.addEventListener('pointerup', endDrag);
cv.addEventListener('pointercancel', endDrag);
document.addEventListener('keydown', e => {
  if (sensorOn) return;
  if (e.key === 'ArrowLeft')  { ring -= 0.12; e.preventDefault(); }
  if (e.key === 'ArrowRight') { ring += 0.12; e.preventDefault(); }
});

btnSpin.addEventListener('click', () => {
  if (sensorOn) { note('وإنتِ ماسكة بوصلة الموبايل، لفّي موبايلك بإيدك 😄'); return; }
  // الدوسات المتتالية بتزوّد السرعة في نفس الاتجاه (مش بتتعاكس وتلغي بعض)
  const dir = omega !== 0 ? Math.sign(omega) : (Math.random() > .5 ? 1 : -1);
  omega = clamp(omega + dir * (8 + Math.random() * 6), -26, 26);
});

// ══════════ حساس الموبايل ══════════
function onOrient(e, isAbsolute) {
  if (isAbsolute) absoluteSeen = true; else if (absoluteSeen) return;   // نفضّل الحدث المطلق لو موجود
  const h = headingFromEvent(e);
  if (h === null) return;
  gotSensor = true; sensorOn = true; dragging = false; omega = 0;
  ringTarget = -h * Math.PI / 180;                                      // الحلقة بتلف عكس اتجاه الموبايل
  btnSensor.classList.add('on'); btnSensor.textContent = 'بوصلة الموبايل شغالة ✓';
}
async function enableSensor() {
  if (sensorOn) { disableSensor(); return; }
  if (typeof DeviceOrientationEvent === 'undefined') { note('جهازك مش بيدعم البوصلة 😅 لفّي الحلقة بإيدك'); return; }
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    try { const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') { note('محتاجين إذن الحساسات عشان البوصلة تشتغل 🙏'); return; } }
    catch (err) { note('مقدرتش أفعّل الحساسات 😅 لفّي الحلقة بإيدك'); return; }
  }
  window.addEventListener('deviceorientationabsolute', sensorAbs, true);
  window.addEventListener('deviceorientation', sensorRel, true);
  note('لفّي موبايلك حواليكِ… وشوفي الحلقة بتلف وإبرتي ثابتة 💗');
  setTimeout(() => { if (!gotSensor) note('الموبايل ده مبعتش بيانات للبوصلة 😅 لفّي الحلقة بإصبعك'); }, 2600);
}
const sensorAbs = e => onOrient(e, true), sensorRel = e => onOrient(e, false);
function disableSensor() {
  window.removeEventListener('deviceorientationabsolute', sensorAbs, true);
  window.removeEventListener('deviceorientation', sensorRel, true);
  sensorOn = false; gotSensor = false; absoluteSeen = false;
  btnSensor.classList.remove('on'); btnSensor.textContent = 'فعّلي بوصلة الموبايل 📱';
  note('رجعنا للّف بالإصبع 👆');
}
btnSensor.addEventListener('click', enableSensor);
function note(t) { noteEl.textContent = t; }

// ══════════ الرسايل ══════════
function checkMessages(turns) {
  const idx = messageIndexFor(turns);
  if (idx > shownIdx) {
    shownIdx = idx;
    const m = MSGS[idx];
    msgEl.textContent = m.text;
    msgEl.className = 'msg' + (m.final ? ' final' : '');
    void msgEl.offsetWidth; msgEl.classList.add('pop');
    const chip = document.createElement('span'); chip.className = 'chip';
    chip.textContent = '🧭 ' + (idx + 1); chipsEl.appendChild(chip);
    hearts(m.final ? 28 : 8);
  }
}

// ══════════ تحديث ورسم ══════════
function step(dt) {
  clock += dt;
  if (sensorOn) {
    const diff = wrap(ringTarget - ring);
    ring += diff * Math.min(1, dt * 10);
  } else if (!dragging) {
    ring += omega * dt;
    omega *= Math.exp(-0.9 * dt);
    if (Math.abs(omega) < 0.02) omega = 0;
  }
  const delta = wrap(ring - prevRing); prevRing = ring;
  if (Math.abs(delta) > 0.002) totalRot += Math.abs(delta);
  const av = delta / Math.max(dt, 1e-3);
  avSmooth += (av - avSmooth) * Math.min(1, dt * 12);
  wobble += (clamp(-avSmooth * 0.05, -0.55, 0.55) - wobble) * Math.min(1, dt * 9);   // الإبرة بتتهز شوية لما اللف بيسرع وترجع تثبت

  const turns = totalRot / TAU;
  turnsEl.textContent = turns < 10 ? turns.toFixed(1) : String(Math.floor(turns));
  checkMessages(turns);
  if (Math.floor(turns * 10) / 10 > record) { record = Math.floor(turns * 10) / 10; save('malak_compass_turns', record); }

  // قلوب ماشية على الإبرة ناحيتها
  streamT -= dt;
  if (streamT <= 0) { stream.push(0); streamT = 0.55; }
  for (let i = stream.length - 1; i >= 0; i--) { stream[i] += dt * 0.55; if (stream[i] > 1) stream.splice(i, 1); }
}

function draw() {
  const c = size / 2, R = size / 2 - 4;
  ctx.clearRect(0, 0, size, size);

  // العلبة الدهبية الثابتة
  const rim = ctx.createRadialGradient(c, c, R * .86, c, c, R);
  rim.addColorStop(0, '#8a6a22'); rim.addColorStop(.5, '#f0d98a'); rim.addColorStop(1, '#9a7428');
  ctx.beginPath(); ctx.arc(c, c, R, 0, TAU); ctx.fillStyle = rim; ctx.fill();
  const face = ctx.createRadialGradient(c, c, 0, c, c, R * .88);
  face.addColorStop(0, '#16203f'); face.addColorStop(1, '#0a0f22');
  ctx.beginPath(); ctx.arc(c, c, R * .88, 0, TAU); ctx.fillStyle = face; ctx.fill();

  // الحلقة اللي بتلف
  ctx.save(); ctx.translate(c, c); ctx.rotate(ring);
  for (let i = 0; i < 72; i++) {
    const a = i * TAU / 72, big = i % 9 === 0, len = big ? R * .075 : R * .035;
    ctx.beginPath(); ctx.moveTo(0, -R * .86); ctx.lineTo(0, -R * .86 + len);
    ctx.strokeStyle = big ? 'rgba(240,208,138,.85)' : 'rgba(240,208,138,.35)'; ctx.lineWidth = big ? 2 : 1;
    ctx.save(); ctx.rotate(a); ctx.stroke(); ctx.restore();
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  DISTRACTIONS.forEach(([emo, word], i) => {
    ctx.save(); ctx.rotate(i * TAU / 8);
    ctx.font = Math.round(R * .12) + 'px serif'; ctx.fillStyle = '#fff'; ctx.fillText(emo, 0, -R * .70);
    ctx.font = '700 ' + Math.round(R * .065) + 'px Amiri, serif'; ctx.fillStyle = 'rgba(240,232,220,.6)'; ctx.fillText(word, 0, -R * .56);
    ctx.restore();
  });
  ctx.restore();

  // قلوب بتمشي ناحية ملك على الإبرة
  ctx.save(); ctx.translate(c, c); ctx.rotate(wobble);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  stream.forEach(p => {
    ctx.globalAlpha = Math.sin(p * Math.PI) * .9;
    ctx.font = Math.round(R * .07 + p * R * .03) + 'px serif'; ctx.fillText('💗', 0, -p * R * .8);
  });
  ctx.globalAlpha = 1;

  // الإبرة (ثابتة ناحية ملك)
  ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.moveTo(0, -R * .82); ctx.lineTo(R * .05, 0); ctx.lineTo(-R * .05, 0); ctx.closePath();
  const ng = ctx.createLinearGradient(0, -R * .82, 0, 0); ng.addColorStop(0, '#ff8fb0'); ng.addColorStop(1, '#b0305a');
  ctx.fillStyle = ng; ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, R * .3); ctx.lineTo(R * .05, 0); ctx.lineTo(-R * .05, 0); ctx.closePath();
  ctx.fillStyle = '#9aa8c8'; ctx.fill();
  ctx.shadowBlur = 0; ctx.restore();

  // المركز
  ctx.beginPath(); ctx.arc(c, c, R * .06, 0, TAU);
  const hub = ctx.createRadialGradient(c - 2, c - 2, 0, c, c, R * .06); hub.addColorStop(0, '#fff3c4'); hub.addColorStop(1, '#b08a2a');
  ctx.fillStyle = hub; ctx.fill();

  // ملك فوق (الوجهة)
  const pulse = 1 + Math.sin(clock * 3) * .08;
  ctx.save(); ctx.translate(c, c - R * .94); ctx.scale(pulse, pulse);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(240,120,170,.9)'; ctx.shadowBlur = 16;
  ctx.font = Math.round(R * .13) + 'px serif'; ctx.fillText('💗', 0, 0); ctx.shadowBlur = 0;
  ctx.restore();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '700 ' + Math.round(R * .075) + 'px Amiri, serif'; ctx.fillStyle = '#3a2a0e';
  ctx.fillText('ملك', c, c - R * .865 + 0);
}

let last = 0;
function frame(ts) {
  const dt = last ? Math.min((ts - last) / 1000, 0.05) : 0.016; last = ts;
  step(dt); draw();
  requestAnimationFrame(frame);
}

// ══════════ تأثيرات + خلفية ══════════
function hearts(n) {
  const s = ['💗', '🧭', '✨', '🌙', '💌'];
  for (let k = 0; k < n; k++) {
    setTimeout(() => {
      const h = document.createElement('div'); h.className = 'float-p';
      h.textContent = s[Math.floor(Math.random() * s.length)];
      h.style.cssText += `left:${10 + Math.random() * 80}vw;font-size:${.8 + Math.random() * 1.1}rem;animation-duration:${2.3 + Math.random() * 2.2}s;`;
      document.body.appendChild(h); setTimeout(() => h.remove(), 5200);
    }, k * 120);
  }
}
const bgC = $('bg-canvas'), bgX = bgC.getContext('2d');
function resizeBg() { bgC.width = innerWidth; bgC.height = innerHeight; }
resizeBg(); window.addEventListener('resize', resizeBg);
const pts = Array.from({ length: 45 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * .7 + .15, vx: (Math.random() - .5) * .1, vy: (Math.random() - .5) * .1, a: Math.random(), da: (Math.random() - .5) * .005, c: Math.random() > .5 ? '201,168,76' : '201,107,138' }));
function drawBg() {
  const w = bgC.width, h = bgC.height; bgX.clearRect(0, 0, w, h);
  pts.forEach(p => {
    p.x += p.vx / w; p.y += p.vy / h; p.a += p.da;
    if (p.a < .05 || p.a > .82) p.da *= -1;
    if (p.x < 0) p.x = 1; if (p.x > 1) p.x = 0; if (p.y < 0) p.y = 1; if (p.y > 1) p.y = 0;
    const px = p.x * w, py = p.y * h, g = bgX.createRadialGradient(px, py, 0, px, py, p.r * 6);
    g.addColorStop(0, `rgba(${p.c},${p.a})`); g.addColorStop(1, `rgba(${p.c},0)`);
    bgX.beginPath(); bgX.arc(px, py, p.r * 6, 0, Math.PI * 2); bgX.fillStyle = g; bgX.fill();
  });
  requestAnimationFrame(drawBg);
}
drawBg();

// ══════════ تشغيل ══════════
fit();
if (record > 0) note('أعلى رقم لفّيتيه قبل كده: ' + record.toFixed(1) + ' لفّة 🧭');
requestAnimationFrame(frame);
