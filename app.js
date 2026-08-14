const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = { videoUrl: null, duration: 0, lines: [], activeLine: 0, mediaRecorder: null, chunks: [], timer: null, startedAt: 0, playbackTimers: [] };
const hero = $('#hero');
const studio = $('#studio');

$('#startButton').addEventListener('click', () => { hero.classList.add('hidden'); studio.classList.remove('hidden'); window.scrollTo({top: 0}); });
$('#chooseVideo').addEventListener('click', () => $('#videoInput').click());
$('#uploadCard').addEventListener('dragover', e => { e.preventDefault(); e.currentTarget.style.borderColor = '#d9ff57'; });
$('#uploadCard').addEventListener('dragleave', e => e.currentTarget.style.borderColor = '');
$('#uploadCard').addEventListener('drop', e => { e.preventDefault(); e.currentTarget.style.borderColor = ''; loadVideo(e.dataTransfer.files[0]); });
$('#videoInput').addEventListener('change', e => loadVideo(e.target.files[0]));

function loadVideo(file) {
  if (!file || !file.type.startsWith('video/')) return toast('Please choose a video file.');
  if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
  state.videoUrl = URL.createObjectURL(file);
  ['setupVideo', 'timingVideo', 'finalVideo'].forEach(id => { const v = $('#' + id); v.src = state.videoUrl; });
  $('#setupVideo').onloadedmetadata = () => {
    state.duration = $('#setupVideo').duration;
    $('#videoDuration').textContent = formatTime(state.duration);
    $('#videoName').textContent = file.name;
    $('#uploadCard').classList.add('hidden');
    $('#videoPreview').classList.remove('hidden');
    $('#sceneNext').disabled = false;
  };
}

function goToStep(n) {
  $$('.panel').forEach(p => p.classList.toggle('active', Number(p.dataset.panel) === n));
  $$('.step').forEach((s, i) => s.classList.toggle('active', i + 1 === n));
  studio.scrollIntoView({behavior: 'smooth'});
  if (n === 3) { syncLinesFromForm(); state.activeLine = Math.min(state.activeLine, state.lines.length - 1); renderTakes(); selectLine(state.activeLine); }
  if (n === 4) preparePremiere();
}

$('#sceneNext').addEventListener('click', () => {
  if (!state.lines.length) {
    state.lines = [
      {id: crypto.randomUUID(), role: 'Player 1', time: 1, text: 'You were supposed to bring the map.', audioUrl: null},
      {id: crypto.randomUUID(), role: 'Player 2', time: 4, text: 'I brought snacks. That is basically the same thing.', audioUrl: null}
    ];
  }
  renderLines(); goToStep(2);
});

$$('.back').forEach(b => b.addEventListener('click', () => goToStep(Number(b.dataset.back))));
$('#linesNext').addEventListener('click', () => goToStep(3));
$('#recordNext').addEventListener('click', () => goToStep(4));
$('#addLine').addEventListener('click', () => { syncLinesFromForm(); state.lines.push({id: crypto.randomUUID(), role: `Player ${(state.lines.length % 4) + 1}`, time: Math.min(state.duration || 99, state.lines.length * 3 + 1), text: '', audioUrl: null}); renderLines(); });

function renderLines() {
  $('#lineList').innerHTML = state.lines.map((line, i) => `<div class="line-card" data-id="${line.id}"><div class="line-meta"><input class="role" aria-label="Role for line ${i+1}" value="${escapeHtml(line.role)}"><input class="time" type="number" min="0" step="0.1" aria-label="Start time" value="${line.time.toFixed(1)}"><button class="time-button" title="Use the video's current time">Use current</button><button class="remove-line" title="Remove line">×</button></div><textarea aria-label="Dialogue for line ${i+1}" placeholder="Write the replacement dialogue…">${escapeHtml(line.text)}</textarea></div>`).join('');
  $$('.time-button', $('#lineList')).forEach(btn => btn.onclick = () => { $('.time', btn.closest('.line-card')).value = $('#timingVideo').currentTime.toFixed(1); });
  $$('.remove-line', $('#lineList')).forEach(btn => btn.onclick = () => { if (state.lines.length === 1) return toast('Keep at least one line.'); state.lines = state.lines.filter(l => l.id !== btn.closest('.line-card').dataset.id); renderLines(); });
}

function syncLinesFromForm() {
  $$('.line-card').forEach(card => {
    const line = state.lines.find(l => l.id === card.dataset.id);
    if (!line) return;
    line.role = $('.role', card).value.trim() || 'Player';
    line.time = Math.max(0, Number($('.time', card).value) || 0);
    line.text = $('textarea', card).value.trim() || '(Improvise something!)';
  });
  state.lines.sort((a,b) => a.time - b.time);
}

function renderTakes() {
  $('#takeList').innerHTML = state.lines.map((l,i) => `<button class="take-item ${l.audioUrl ? 'recorded' : ''} ${i === state.activeLine ? 'active' : ''}" data-index="${i}"><b>${escapeHtml(l.role)}</b><br><span>${formatTime(l.time)} · ${escapeHtml(l.text.slice(0,38))}</span></button>`).join('');
  $$('.take-item').forEach(item => item.onclick = () => selectLine(Number(item.dataset.index)));
  updatePremiereButton();
}

function selectLine(index) {
  state.activeLine = index;
  const line = state.lines[index];
  if (!line) return;
  $('#currentRole').textContent = line.role.toUpperCase();
  $('#currentText').textContent = `“${line.text}”`;
  $('#currentTimestamp').textContent = formatTime(line.time);
  $('#recordPlayback').classList.toggle('hidden', !line.audioUrl);
  if (line.audioUrl) $('#recordPlayback').src = line.audioUrl;
  $('#recordStatus').textContent = line.audioUrl ? 'Recorded — tap to replace' : 'Tap to record';
  $$('.take-item').forEach((item,i) => item.classList.toggle('active', i === index));
}

$('#recordButton').addEventListener('click', async () => {
  if (state.mediaRecorder?.state === 'recording') return state.mediaRecorder.stop();
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('Audio recording is not supported in this browser.');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({audio: true});
    state.chunks = [];
    state.mediaRecorder = new MediaRecorder(stream);
    state.mediaRecorder.ondataavailable = e => { if (e.data.size) state.chunks.push(e.data); };
    state.mediaRecorder.onstop = () => {
      const blob = new Blob(state.chunks, {type: state.mediaRecorder.mimeType || 'audio/webm'});
      const line = state.lines[state.activeLine];
      if (line.audioUrl) URL.revokeObjectURL(line.audioUrl);
      line.audioUrl = URL.createObjectURL(blob);
      stream.getTracks().forEach(t => t.stop());
      clearInterval(state.timer);
      $('#recordButton').classList.remove('recording');
      $('#recordTimer').textContent = '00:00';
      renderTakes(); selectLine(state.activeLine); toast('Take saved!');
    };
    state.mediaRecorder.start();
    state.startedAt = Date.now();
    $('#recordButton').classList.add('recording');
    $('#recordStatus').textContent = 'Recording… tap to stop';
    state.timer = setInterval(() => $('#recordTimer').textContent = formatClock((Date.now() - state.startedAt) / 1000), 200);
  } catch (err) { toast(err.name === 'NotAllowedError' ? 'Microphone permission was denied.' : 'Could not start the microphone.'); }
});

function updatePremiereButton() { const count = state.lines.filter(l => l.audioUrl).length; $('#recordNext').disabled = count === 0; $('#recordNext').textContent = count ? `Watch with ${count} take${count > 1 ? 's' : ''} →` : 'Record a line first'; }

function preparePremiere() {
  const video = $('#finalVideo'); video.currentTime = 0; video.muted = true;
  $('#playDub').classList.remove('hidden');
}

$('#playDub').addEventListener('click', async () => {
  const video = $('#finalVideo');
  stopDub(); video.currentTime = 0; video.muted = true;
  $('#playDub').classList.add('hidden');
  await video.play();
  state.lines.filter(l => l.audioUrl).forEach(line => {
    const timer = setTimeout(() => { if (!video.paused) new Audio(line.audioUrl).play().catch(()=>{}); }, line.time * 1000);
    state.playbackTimers.push(timer);
  });
  video.onended = () => { stopDub(); $('#playDub').classList.remove('hidden'); };
});

function stopDub() { state.playbackTimers.forEach(clearTimeout); state.playbackTimers = []; }
$('#finalVideo').addEventListener('pause', () => { if (!$('#finalVideo').ended) { stopDub(); $('#playDub').classList.remove('hidden'); } });
$('#newDub').addEventListener('click', resetSession);
$('#resetButton').addEventListener('click', resetSession);
function resetSession() { stopDub(); state.lines.forEach(l => l.audioUrl && URL.revokeObjectURL(l.audioUrl)); if (state.videoUrl) URL.revokeObjectURL(state.videoUrl); Object.assign(state,{videoUrl:null,duration:0,lines:[],activeLine:0,mediaRecorder:null,chunks:[]}); ['setupVideo','timingVideo','finalVideo'].forEach(id => { $('#'+id).removeAttribute('src'); $('#'+id).load(); }); $('#videoInput').value=''; $('#uploadCard').classList.remove('hidden'); $('#videoPreview').classList.add('hidden'); $('#sceneNext').disabled=true; goToStep(1); toast('Fresh session ready.'); }

function toast(message) { const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(el._timer); el._timer=setTimeout(()=>el.classList.remove('show'),2600); }
function formatTime(s) { if (!Number.isFinite(s)) return '00:00.0'; return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}.${Math.floor((s%1)*10)}`; }
function formatClock(s) { return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`; }
function escapeHtml(s='') { return s.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
