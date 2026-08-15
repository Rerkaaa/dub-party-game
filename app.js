const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const RECORDING_LIMIT_SECONDS = 20;
const state = { videoUrl: null, duration: 0, lines: [], activeLine: 0, mediaRecorder: null, recordStream: null, chunks: [], timer: null, recordingLimitTimer: null, startedAt: 0, playbackTimers: [], activeAudios: [] };
const hero = $('#hero');
const studio = $('#studio');

$('#startButton').addEventListener('click', () => { hero.classList.add('hidden'); studio.classList.remove('hidden'); window.scrollTo({ top: 0 }); });
$('#chooseVideo').addEventListener('click', () => $('#videoInput').click());
$('#uploadCard').addEventListener('dragover', e => { e.preventDefault(); e.currentTarget.style.borderColor = '#d9ff57'; });
$('#uploadCard').addEventListener('dragleave', e => { e.currentTarget.style.borderColor = ''; });
$('#uploadCard').addEventListener('drop', e => { e.preventDefault(); e.currentTarget.style.borderColor = ''; loadVideo(e.dataTransfer.files[0]); });
$('#videoInput').addEventListener('change', e => loadVideo(e.target.files[0]));

function loadVideo(file) {
  if (!file || !file.type.startsWith('video/')) return toast('Please choose a video file.');
  stopRecording(); stopDub();
  if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
  state.videoUrl = URL.createObjectURL(file);
  ['setupVideo', 'timingVideo', 'finalVideo'].forEach(id => { $('#' + id).src = state.videoUrl; });
  $('#setupVideo').onloadedmetadata = () => {
    state.duration = $('#setupVideo').duration;
    $('#videoDuration').textContent = formatTime(state.duration);
    $('#videoName').textContent = file.name;
    $('#uploadCard').classList.add('hidden'); $('#videoPreview').classList.remove('hidden');
    updateStepControls();
  };
}

function canVisitStep(step) {
  if (step === 1) return true;
  if (step === 2) return Boolean(state.videoUrl);
  if (step === 3) return state.lines.length > 0 && validateLines(false);
  return state.lines.some(line => line.audioUrl);
}
function goToStep(step) {
  if (!canVisitStep(step)) return toast(step === 1 ? 'Choose a video first.' : 'Complete the earlier step first.');
  $$('.panel').forEach(p => p.classList.toggle('active', Number(p.dataset.panel) === step));
  $$('.step').forEach((b, i) => { const active = i + 1 === step; b.classList.toggle('active', active); b.setAttribute('aria-current', active ? 'step' : 'false'); });
  studio.scrollIntoView({ behavior: 'smooth' });
  if (step === 3) { if (!syncLinesFromForm()) return goToStep(2); state.activeLine = Math.max(0, Math.min(state.activeLine, state.lines.length - 1)); renderTakes(); selectLine(state.activeLine); }
  if (step === 4) preparePremiere();
  updateStepControls();
}
function updateStepControls() {
  $$('.step').forEach((b, i) => { b.disabled = !canVisitStep(i + 1); });
  const takes = state.lines.filter(l => l.audioUrl).length;
  $('#sceneNext').disabled = !state.videoUrl;
  $('#recordNext').disabled = takes === 0;
  $('#recordNext').textContent = takes ? `Watch with ${takes} take${takes === 1 ? '' : 's'} →` : 'Record a line first';
}

$('#sceneNext').addEventListener('click', () => {
  if (!state.lines.length) state.lines = [
    { id: crypto.randomUUID(), role: 'Player 1', time: 1, text: 'You were supposed to bring the map.', audioUrl: null },
    { id: crypto.randomUUID(), role: 'Player 2', time: 4, text: 'I brought snacks. That is basically the same thing.', audioUrl: null }
  ];
  renderLines(); goToStep(2);
});
$$('.back').forEach(b => b.addEventListener('click', () => goToStep(Number(b.dataset.back))));
$$('.step').forEach((b, i) => b.addEventListener('click', () => goToStep(i + 1)));
$('#linesNext').addEventListener('click', () => { if (syncLinesFromForm()) goToStep(3); });
$('#recordNext').addEventListener('click', () => goToStep(4));
$('#addLine').addEventListener('click', () => { if (!syncLinesFromForm()) return; state.lines.push({ id: crypto.randomUUID(), role: `Player ${(state.lines.length % 4) + 1}`, time: Math.min(Math.max(0, state.duration - .1), state.lines.length * 3 + 1), text: '', audioUrl: null }); renderLines(); });

function renderLines() {
  $('#lineList').innerHTML = state.lines.map((line, i) => `<div class="line-card" data-id="${line.id}"><div class="line-meta"><input class="role" aria-label="Role for line ${i + 1}" value="${escapeHtml(line.role)}"><input class="time" type="number" min="0" max="${state.duration || 0}" step="0.1" aria-label="Start time for line ${i + 1}" value="${line.time.toFixed(1)}"><button class="time-button" type="button">Use current time</button><button class="remove-line" type="button" aria-label="Remove line ${i + 1}">×</button></div><textarea aria-label="Dialogue for line ${i + 1}" placeholder="Write the replacement dialogue…">${escapeHtml(line.text)}</textarea></div>`).join('');
  $$('.time-button', $('#lineList')).forEach(b => b.onclick = () => { $('.time', b.closest('.line-card')).value = Math.min($('#timingVideo').currentTime, state.duration).toFixed(1); syncLinesFromForm(); });
  $$('.remove-line', $('#lineList')).forEach(b => b.onclick = () => {
    if (state.lines.length === 1) return toast('Keep at least one line.');
    const line = state.lines.find(l => l.id === b.closest('.line-card').dataset.id);
    if (line.audioUrl) URL.revokeObjectURL(line.audioUrl);
    state.lines = state.lines.filter(l => l !== line); renderLines(); updateStepControls();
  });
  validateLines(false);
}
function syncLinesFromForm() {
  $$('.line-card').forEach(card => {
    const line = state.lines.find(l => l.id === card.dataset.id); if (!line) return;
    line.role = $('.role', card).value.trim() || 'Player';
    line.time = Number($('.time', card).value);
    line.text = $('textarea', card).value.trim() || '(Improvise something!)';
  });
  state.lines.sort((a, b) => a.time - b.time);
  return validateLines(true);
}
function validateLines(showToast) {
  const invalid = state.lines.some(l => !Number.isFinite(l.time) || l.time < 0 || l.time >= state.duration);
  const overlap = state.lines.some((l, i) => i && l.time - state.lines[i - 1].time < .35);
  const notice = $('#lineNotice');
  if (invalid) { notice.textContent = `Each timestamp must be between 00:00.0 and ${formatTime(Math.max(0, state.duration - .1))}.`; notice.classList.add('error'); if (showToast) toast('Fix the line timestamps before recording.'); return false; }
  notice.textContent = overlap ? 'Some lines start less than 0.35 seconds apart; their recordings may overlap.' : '';
  notice.classList.remove('error'); return true;
}
function renderTakes() {
  $('#takeList').innerHTML = state.lines.map((l, i) => `<button class="take-item ${l.audioUrl ? 'recorded' : ''} ${i === state.activeLine ? 'active' : ''}" type="button" data-index="${i}"><b>${escapeHtml(l.role)}</b><br><span>${formatTime(l.time)} · ${escapeHtml(l.text.slice(0, 38))}</span></button>`).join('');
  $$('.take-item').forEach(item => item.onclick = () => selectLine(Number(item.dataset.index)));
  updateStepControls();
}
function selectLine(index) {
  state.activeLine = index; const line = state.lines[index]; if (!line) return;
  $('#currentRole').textContent = line.role.toUpperCase(); $('#currentText').textContent = `“${line.text}”`; $('#currentTimestamp').textContent = formatTime(line.time);
  $('#recordPlayback').classList.toggle('hidden', !line.audioUrl); if (line.audioUrl) $('#recordPlayback').src = line.audioUrl;
  $('#recordStatus').textContent = line.audioUrl ? 'Recorded — tap to replace' : 'Tap to record';
  $$('.take-item').forEach((item, i) => item.classList.toggle('active', i === index));
}

$('#recordButton').addEventListener('click', async () => {
  if (state.mediaRecorder?.state === 'recording') return stopRecording();
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('Audio recording is not supported in this browser. Try a current Chrome, Edge, Firefox, or Safari browser.');
  try {
    state.recordStream = await navigator.mediaDevices.getUserMedia({ audio: true }); state.chunks = [];
    state.mediaRecorder = new MediaRecorder(state.recordStream);
    state.mediaRecorder.ondataavailable = e => { if (e.data.size) state.chunks.push(e.data); };
    state.mediaRecorder.onstop = saveRecording; state.mediaRecorder.start(); state.startedAt = Date.now();
    $('#recordButton').classList.add('recording'); $('#recordButton').setAttribute('aria-label', 'Stop recording');
    $('#recordStatus').textContent = `Recording… tap to stop (max ${RECORDING_LIMIT_SECONDS}s)`;
    state.timer = setInterval(() => $('#recordTimer').textContent = formatClock((Date.now() - state.startedAt) / 1000), 200);
    state.recordingLimitTimer = setTimeout(() => { toast(`Recording stopped after ${RECORDING_LIMIT_SECONDS} seconds.`); stopRecording(); }, RECORDING_LIMIT_SECONDS * 1000);
  } catch (e) { toast(e.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow microphone access in your browser settings and try again.' : 'Could not start the microphone. Check that no other app is using it.'); }
});
function stopRecording() { if (state.mediaRecorder?.state === 'recording') state.mediaRecorder.stop(); }
function saveRecording() {
  const blob = new Blob(state.chunks, { type: state.mediaRecorder.mimeType || 'audio/webm' }); const line = state.lines[state.activeLine];
  if (line && blob.size) { if (line.audioUrl) URL.revokeObjectURL(line.audioUrl); line.audioUrl = URL.createObjectURL(blob); toast('Take saved!'); }
  state.recordStream?.getTracks().forEach(track => track.stop()); state.recordStream = null; clearInterval(state.timer); clearTimeout(state.recordingLimitTimer);
  $('#recordButton').classList.remove('recording'); $('#recordButton').setAttribute('aria-label', 'Start recording'); $('#recordTimer').textContent = '00:00';
  renderTakes(); selectLine(state.activeLine);
}

function preparePremiere() { const video = $('#finalVideo'); stopDub(); video.currentTime = 0; video.muted = true; $('#playDub').classList.remove('hidden'); }
$('#playDub').addEventListener('click', async () => { const video = $('#finalVideo'); video.currentTime = 0; video.muted = true; try { await video.play(); $('#playDub').classList.add('hidden'); } catch { toast('Video playback was blocked. Press play on the video and try again.'); } });
function stopDub() { state.playbackTimers.forEach(clearTimeout); state.playbackTimers = []; state.activeAudios.forEach(a => { a.pause(); a.src = ''; }); state.activeAudios = []; }
function syncDubToVideo() {
  const video = $('#finalVideo'); stopDub(); if (video.paused || video.ended) return;
  state.lines.filter(l => l.audioUrl).forEach(line => {
    const offset = video.currentTime - line.time;
    if (offset >= 0) playTake(line, offset);
    else state.playbackTimers.push(setTimeout(() => playTake(line, 0), -offset * 1000 / video.playbackRate));
  });
}
function playTake(line, offset) {
  const video = $('#finalVideo'); if (video.paused || video.ended) return;
  const audio = new Audio(line.audioUrl); audio.playbackRate = video.playbackRate; state.activeAudios.push(audio);
  audio.addEventListener('canplay', () => { if (offset > 0 && Number.isFinite(audio.duration) && offset < audio.duration) audio.currentTime = offset; if (!video.paused && !video.ended) audio.play().catch(() => {}); }, { once: true });
  audio.addEventListener('ended', () => { state.activeAudios = state.activeAudios.filter(a => a !== audio); }, { once: true });
}
const finalVideo = $('#finalVideo');
finalVideo.addEventListener('play', syncDubToVideo);
finalVideo.addEventListener('pause', () => { if (!finalVideo.ended) { stopDub(); $('#playDub').classList.remove('hidden'); } });
finalVideo.addEventListener('seeking', stopDub);
finalVideo.addEventListener('seeked', () => { if (!finalVideo.paused) syncDubToVideo(); });
finalVideo.addEventListener('ratechange', () => { if (!finalVideo.paused) syncDubToVideo(); });
finalVideo.addEventListener('ended', () => { stopDub(); $('#playDub').classList.remove('hidden'); });

$('#newDub').addEventListener('click', resetSession); $('#resetButton').addEventListener('click', resetSession);
function resetSession() {
  stopRecording(); stopDub(); state.lines.forEach(l => l.audioUrl && URL.revokeObjectURL(l.audioUrl)); if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
  Object.assign(state, { videoUrl: null, duration: 0, lines: [], activeLine: 0, mediaRecorder: null, recordStream: null, chunks: [] });
  ['setupVideo', 'timingVideo', 'finalVideo'].forEach(id => { const video = $('#' + id); video.removeAttribute('src'); video.load(); });
  $('#videoInput').value = ''; $('#uploadCard').classList.remove('hidden'); $('#videoPreview').classList.add('hidden'); $('#lineNotice').textContent = '';
  goToStep(1); toast('Fresh session ready.');
}
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(el._timer); el._timer = setTimeout(() => el.classList.remove('show'), 3600); }
function formatTime(s) { if (!Number.isFinite(s)) return '00:00.0'; return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`; }
function formatClock(s) { return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }
function escapeHtml(s = '') { return s.replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
