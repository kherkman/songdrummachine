document.addEventListener('DOMContentLoaded', async () => {
    // --- GLOBAL STATE & CORE VARIABLES ---
    let audioContext;
    const audioBuffers = {};
    let isPlaying = false;
    let isSongPlaying = false;
    let currentStep = 0;
    let bpm = 120;
    let timingHumanizeAmount = 0;
    let velocityHumanizeAmount = 0;
    let swingAmount = 0;
    let isHumanizeOn = false;
    let sequencersData = {};
    let skinsData = {};

    // --- MASTERING SYSTEM INSTANCE ---
    let masteringProcessor = null;

    // --- PLAYBACK SCHEDULING VARIABLES ---
    let schedulerTimerID;
    let nextNoteTime = 0.0;
    const scheduleAheadTime = 0.1;
    let playbackPhase = 'stopped'; // 'stopped', 'countingIn', 'song'

    // --- SONG MODE STATE ---
    let songBlocks = [];
    let currentSongSectionIndex = 0;
    let currentSongSequencerId = '';
    let randomFillsEnabled = true;
    let isPlayingFill = false;
    let currentFillPattern = null;
    let fillStepCount = 0;
    let isCountInEnabled = false;
    let previousBpm = 120; // tracking tempo jumps/glides
    let totalSongDuration = 0.0;
    
    // --- MIDI & EXAMPLE SONG DATA ---
    let midiAccess = null;
    let currentMidiInput = null;
    let currentMidiOutput = null;
    let exampleSongsData = {};
    
    // --- PATTERN DATA (LOADED FROM JS DATA MODULES) ---
    let RHYTHM_PATTERNS = {};

    // --- CONSTANTS ---
    const DEFAULT_INSTRUMENTS = [
        'crash1', 'crash2', 'ride', 'china',
        'tom1', 'tom2', 'tom3', 'floor-tom',
        'hi-hat-open', 'hi-hat-closed', 'snare', 'kick'
    ];
    let INSTRUMENTS = [...DEFAULT_INSTRUMENTS];
    const FILL_INSTRUMENTS = ['snare', 'tom1', 'tom2', 'tom3', 'floor-tom'];
    const VALID_TIME_SIGNATURES = ['4/4', '3/4', '6/8', '12/8', '2/4', '5/4', '5/8', '7/8'];

    const KEY_MAP = {
        'a': 'kick', 's': 'snare', 'd': 'hi-hat-closed', 'f': 'tom2', 'g': 'tom1', 'h': 'floor-tom', 'j': 'tom3',
        'w': 'hi-hat-open', 'e': 'crash1', 'r': 'ride', 't': 'crash2', 'y': 'china'
    };

    const VISUAL_TO_INSTRUMENT_MAP = {
        'kick': 'kick', 'snare': 'snare', 'hi-hat': 'hi-hat-closed', 'tom1': 'tom1',
        'tom2': 'tom2', 'tom3': 'tom3', 'floor-tom': 'floor-tom', 'crash1': 'crash1', 'crash2': 'crash2',
        'ride': 'ride', 'china': 'china'
    };

    const VISUAL_MAP = {
        'crash1': 'crash1', 'crash2': 'crash2', 'ride': 'ride', 'china': 'china',
        'tom1': 'tom1', 'tom2': 'tom2', 'tom3': 'tom3', 'floor-tom': 'floor-tom',
        'hi-hat-open': 'hi-hat', 'hi-hat-closed': 'hi-hat', 'snare': 'snare', 'kick': 'kick'
    };

    // --- GLOBAL MIXER SETTINGS ---
    let globalMixerSettings = {
        'crash1': { volume: 0.4, panning: -0.4 },
        'crash2': { volume: 0.4, panning: 0.4 },
        'ride': { volume: 0.35, panning: 0.3 },
        'china': { volume: 0.25, panning: -0.3 },
        'tom1': { volume: 0.9, panning: -0.2 },
        'tom2': { volume: 0.9, panning: 0.2 },
        'tom3': { volume: 0.9, panning: 0.5 },
        'floor-tom': { volume: 0.9, panning: 0.6 },
        'hi-hat-open': { volume: 0.3, panning: 0.1 },
        'hi-hat-closed': { volume: 0.2, panning: 0.1 },
        'snare': { volume: 1.0, panning: 0 },
        'kick': { volume: 1.0, panning: 0 }
    };

    const instrumentNames = {};
    const roundRobinIndices = {};
    
    const INSTRUMENT_MIDI_NOTES = {
        'kick': 36, 'snare': 38, 'hi-hat-closed': 42, 'hi-hat-open': 46, 'floor-tom': 41, 
        'tom3': 43, 'tom2': 45, 'tom1': 47, 'crash1': 49, 'crash2': 57, 'ride': 51, 'china': 52
    };

    const midiNoteToInstrumentMap = {
        36: 'kick', 35: 'kick', 38: 'snare', 40: 'snare', 42: 'hi-hat-closed', 44: 'hi-hat-closed',
        46: 'hi-hat-open', 41: 'floor-tom', 43: 'tom3', 45: 'tom2', 47: 'tom1', 48: 'tom1',
        50: 'tom1', 49: 'crash1', 57: 'crash2', 51: 'ride', 52: 'china', 55: 'crash1', 59: 'ride',
    };
    
    // --- DOM ELEMENT REFERENCES ---
    const sequencersContainer = document.getElementById('sequencers-container');
    const tempoInput = document.getElementById('tempo-input');
    const tapTempoBtn = document.getElementById('tap-tempo-btn');
    const masterVolume = document.getElementById('master-volume');
    const humanizeBtn = document.getElementById('humanize-btn');
    const timingHumanizeSlider = document.getElementById('timing-humanize-slider');
    const velocityHumanizeSlider = document.getElementById('velocity-humanize-slider');
    const swingSlider = document.getElementById('swing-slider');
    const insertSequencersBtn = document.getElementById('insert-sequencers-btn');
    const sequencerAmountInput = document.getElementById('sequencer-amount-input');
    const songPlayBtn = document.getElementById('song-play-btn');
    const songStructureInput = document.getElementById('song-structure-input');
    const scanMidiBtn = document.getElementById('scan-midi-btn');
    const midiInSelect = document.getElementById('midi-in-select');
    const midiOutSelect = document.getElementById('midi-out-select');
    const exampleSongSelect = document.getElementById('example-song-select');
    const randomFillsBtn = document.getElementById('random-fills-btn');
    const countInBtn = document.getElementById('count-in-btn');
    const toggleMixerBtn = document.getElementById('toggle-mixer-btn');
    const toggleVisualizerBtn = document.getElementById('toggle-visualizer-btn');
    const toggleMasteringBtn = document.getElementById('toggle-mastering-btn');
    const infoBtn = document.getElementById('info-btn');
    const skinSelect = document.getElementById('skin-select');
    const randomSongBtn = document.getElementById('random-song-btn');
    const exportSongBtn = document.getElementById('export-song-btn');
    const importSongBtn = document.getElementById('import-song-btn');
    const saveSessionBtn = document.getElementById('save-session-btn');
    const loadSessionBtn = document.getElementById('load-session-btn');
    
    function getInstrumentDisplayName(id) {
        return instrumentNames[id] || id.replace(/-/g, ' ');
    }

    function updateInstrumentLabels() {
        document.querySelectorAll('.instrument-label').forEach(label => {
            const instId = label.dataset.instrument;
            if (instId) {
                label.textContent = getInstrumentDisplayName(instId);
            }
        });
        document.querySelectorAll('.mix-strip').forEach(strip => {
            const instId = strip.querySelector('.sample-import-btn')?.dataset.instrument;
            if (instId) {
                strip.querySelector('.instrument-name').textContent = getInstrumentDisplayName(instId);
            }
        });
    }

    async function initAudio() {
        if (audioContext) return;
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            if (window.MasteringProcessor) {
                masteringProcessor = new window.MasteringProcessor(audioContext);
                masteringProcessor.output.connect(audioContext.destination);
                initMasteringUIListeners();
            }
            
            await loadAllSamples();
        } catch (e) {
            alert('Web Audio API is not supported or could not be initialized.');
            console.error(e);
        }
    }

    function initMasteringUIListeners() {
        // Power toggles
        document.getElementById('sat-toggle-btn').onclick = (e) => {
            masteringProcessor.states.saturation = !masteringProcessor.states.saturation;
            e.target.classList.toggle('active', masteringProcessor.states.saturation);
            e.target.textContent = masteringProcessor.states.saturation ? 'ON' : 'OFF';
            masteringProcessor.updateBypassGains();
        };
        document.getElementById('comp-toggle-btn').onclick = (e) => {
            masteringProcessor.states.compressor = !masteringProcessor.states.compressor;
            e.target.classList.toggle('active', masteringProcessor.states.compressor);
            e.target.textContent = masteringProcessor.states.compressor ? 'ON' : 'OFF';
            masteringProcessor.updateBypassGains();
        };
        document.getElementById('filter-toggle-btn').onclick = (e) => {
            masteringProcessor.states.filter = !masteringProcessor.states.filter;
            e.target.classList.toggle('active', masteringProcessor.states.filter);
            e.target.textContent = masteringProcessor.states.filter ? 'ON' : 'OFF';
            masteringProcessor.updateBypassGains();
        };
        document.getElementById('delay-toggle-btn').onclick = (e) => {
            masteringProcessor.states.delay = !masteringProcessor.states.delay;
            e.target.classList.toggle('active', masteringProcessor.states.delay);
            e.target.textContent = masteringProcessor.states.delay ? 'ON' : 'OFF';
            masteringProcessor.updateBypassGains();
        };
        document.getElementById('reverb-toggle-btn').onclick = (e) => {
            masteringProcessor.states.reverb = !masteringProcessor.states.reverb;
            e.target.classList.toggle('active', masteringProcessor.states.reverb);
            e.target.textContent = masteringProcessor.states.reverb ? 'ON' : 'OFF';
            masteringProcessor.updateBypassGains();
        };
        document.getElementById('limiter-toggle-btn').onclick = (e) => {
            masteringProcessor.states.limiter = !masteringProcessor.states.limiter;
            e.target.classList.toggle('active', masteringProcessor.states.limiter);
            e.target.textContent = masteringProcessor.states.limiter ? 'ON' : 'OFF';
            masteringProcessor.updateBypassGains();
        };

        // Modulation ranges
        document.getElementById('sat-drive').oninput = (e) => {
            masteringProcessor.satNode.curve = masteringProcessor.makeDistortionCurve(parseInt(e.target.value, 10));
        };
        document.getElementById('sat-mix').oninput = (e) => {
            masteringProcessor.satMixValue = parseInt(e.target.value, 10) / 100;
            masteringProcessor.updateBypassGains();
        };
        document.getElementById('comp-thresh').oninput = (e) => {
            masteringProcessor.compNode.threshold.setValueAtTime(parseFloat(e.target.value), audioContext.currentTime);
        };
        document.getElementById('comp-ratio').oninput = (e) => {
            masteringProcessor.compNode.ratio.setValueAtTime(parseFloat(e.target.value), audioContext.currentTime);
        };
        document.getElementById('filter-hpf').oninput = (e) => {
            masteringProcessor.hpfNode.frequency.setValueAtTime(parseFloat(e.target.value), audioContext.currentTime);
        };
        document.getElementById('filter-lpf').oninput = (e) => {
            masteringProcessor.lpfNode.frequency.setValueAtTime(parseFloat(e.target.value), audioContext.currentTime);
        };
        document.getElementById('delay-time').oninput = (e) => {
            masteringProcessor.delayNode.delayTime.setValueAtTime(parseInt(e.target.value, 10) / 1000, audioContext.currentTime);
        };
        document.getElementById('delay-feedback').oninput = (e) => {
            masteringProcessor.delayFeedback.gain.setValueAtTime(parseInt(e.target.value, 10) / 100, audioContext.currentTime);
        };
        document.getElementById('reverb-decay').oninput = (e) => {
            masteringProcessor.setReverbDecay(parseInt(e.target.value, 10) / 10);
        };
        document.getElementById('reverb-mix').oninput = (e) => {
            masteringProcessor.reverbMixValue = parseInt(e.target.value, 10) / 100;
            masteringProcessor.updateBypassGains();
        };
        document.getElementById('limiter-ceil').oninput = (e) => {
            masteringProcessor.limiterNode.threshold.setValueAtTime(parseFloat(e.target.value), audioContext.currentTime);
        };
    }

    // 1. Define the serialization helper
    function triggerAutoSave() {
        try {
            const sessionData = {
                version: 1,
                bpm,
                songStructure: songStructureInput.value,
                globalMixerSettings,
                isHumanizeOn,
                timingHumanizeAmount,
                velocityHumanizeAmount,
                swingAmount,
                isCountInEnabled,
                randomFillsEnabled,
                skinName: skinSelect.value,
                sequencersData,
                instrumentNames,
                INSTRUMENTS
            };
            localStorage.setItem('drum_sequencer_autosave', JSON.stringify(sessionData));
        } catch (e) {
            console.warn("Auto-save failed:", e);
        }
    }

    // 2. Define the restoration loader (call this during initialization)
    function loadAutoSave() {
        const saved = localStorage.getItem('drum_sequencer_autosave');
        if (!saved) return false;
        try {
            const sessionData = JSON.parse(saved);
            if (sessionData.version !== 1) return false;

            bpm = sessionData.bpm;
            tempoInput.value = bpm;
            songStructureInput.value = sessionData.songStructure;
            
            isHumanizeOn = sessionData.isHumanizeOn;
            timingHumanizeAmount = sessionData.timingHumanizeAmount;
            velocityHumanizeAmount = sessionData.velocityHumanizeAmount;
            swingAmount = sessionData.swingAmount;
            
            humanizeBtn.classList.toggle('toggled-on', isHumanizeOn);
            humanizeBtn.textContent = isHumanizeOn ? "Humanize ON" : "Humanize OFF";
            timingHumanizeSlider.value = timingHumanizeAmount;
            velocityHumanizeSlider.value = velocityHumanizeAmount;
            swingSlider.value = swingAmount;

            isCountInEnabled = sessionData.isCountInEnabled;
            countInBtn.classList.toggle('toggled-on', isCountInEnabled);
            countInBtn.textContent = isCountInEnabled ? "Count In ON" : "Count In OFF";

            randomFillsEnabled = sessionData.randomFillsEnabled;
            randomFillsBtn.classList.toggle('toggled-on', randomFillsEnabled);
            randomFillsBtn.textContent = randomFillsEnabled ? "Fills ON" : "Fills OFF";

            globalMixerSettings = sessionData.globalMixerSettings;
            Object.assign(instrumentNames, sessionData.instrumentNames || {});
            INSTRUMENTS = sessionData.INSTRUMENTS || [...DEFAULT_INSTRUMENTS];

            createGlobalMixerPanel();

            sequencersData = sessionData.sequencersData;
            for (const id in sequencersData) {
                const seqData = sequencersData[id];
                createSequencer(id, seqData.name);
                sequencersData[id] = seqData;
                updateSequencerGrid(id, seqData.steps);
            }

            if (sessionData.skinName && skinsData[sessionData.skinName]) {
                skinSelect.value = sessionData.skinName;
                applySkin(skinsData[sessionData.skinName]);
            }

            renderSongStructureVisual();
            return true;
        } catch (e) {
            console.error("Failed to parse auto-save:", e);
            return false;
        }
    }

    // 3. Register Auto-Save triggers to all state modifications
    // Map 'triggerAutoSave()' call to:
    // - Step checkbox 'onchange'
    // - Velocity slider 'oninput'
    // - Slider value changes (Volume, Panning, Humanizer, Swing)
    // - Tempo and Song Structure 'onchange' or 'oninput'
    // - Adding/removing sequencers or custom instruments

    // 4. Bind the "Reset Everything" button in main.js
    document.getElementById('reset-everything-btn').addEventListener('click', () => {
        const confirmation = confirm("Are you sure you want to reset everything? This will delete all custom settings, patterns, and loaded custom samples, reverting to factory defaults.");
        if (confirmation) {
            localStorage.removeItem('drum_sequencer_autosave');
            location.reload();
        }
    });

    async function loadSample(instrument) {
        try {
            const response = await fetch(`${instrument}.wav`);
            if (!response.ok) throw new Error(`Could not load ${instrument}.wav.`);
            const arrayBuffer = await response.arrayBuffer();
            const decoded = await audioContext.decodeAudioData(arrayBuffer);
            audioBuffers[instrument] = [decoded]; // Wrapped in array to match dynamic round-robin lists
        } catch (error) {
            console.error(error);
        }
    }

    async function loadAllSamples() {
        await Promise.all(DEFAULT_INSTRUMENTS.map(loadSample));
        console.log('Default samples loaded.');
    }

    function loadRhythmPatterns() {
        RHYTHM_PATTERNS = window.RHYTHM_PATTERNS || {};
        console.log('Rhythm patterns loaded.');
    }

    function loadSkins() {
        skinsData = window.SKINS_DATA || {};
        console.log('Skins loaded.');
        populateSkinSelector();
        const firstSkinName = Object.keys(skinsData)[0];
        if (firstSkinName) {
            applySkin(skinsData[firstSkinName]);
        }
    }

    function populateSkinSelector() {
        skinSelect.innerHTML = '';
        for (const skinName in skinsData) {
            const option = document.createElement('option');
            option.value = skinName;
            option.textContent = skinName;
            skinSelect.appendChild(option);
        }
    }

    function applySkin(skin) {
        const root = document.documentElement;
        for (const [property, value] of Object.entries(skin)) {
            root.style.setProperty(property, value);
        }
    }

    function handleSkinChange(e) {
        const skinName = e.target.value;
        const skin = skinsData[skinName];
        if (skin) {
            applySkin(skin);
        }
    }

    function createSequencer(id, name) {
        const sequencerDiv = document.createElement('div');
        sequencerDiv.className = 'sequencer-container';
        sequencerDiv.id = `sequencer-${id}`;

        const gridInitialState = {};
        const velocitiesInitialState = {};
        INSTRUMENTS.forEach(inst => {
            gridInitialState[inst] = Array(64).fill(false);
            velocitiesInitialState[inst] = Array(64).fill(100);
        });

        sequencersData[id] = { 
            name: name, 
            steps: 16, 
            timeSignature: '4/4', 
            tuplet: 'none', 
            grid: gridInitialState, 
            velocities: velocitiesInitialState 
        };

        const header = document.createElement('div');
        header.className = 'sequencer-header';
        header.innerHTML = `
            <button class="remove-sequencer-btn" data-sequencer-id="${id}">X</button>
            <button class="hide-show-btn" data-sequencer-id="${id}">Hide</button>
            <input type="text" class="sequencer-name" value="${name}" data-sequencer-id="${id}" data-old-name="${name}" maxlength="1">
            <div class="control-group">
                <label>Steps</label>
                <input type="number" class="steps-input" value="16" min="4" max="64" data-sequencer-id="${id}">
            </div>
            <div class="control-group">
                <label>Time Sig</label>
                <select class="time-signature-select" data-sequencer-id="${id}">
                    ${VALID_TIME_SIGNATURES.map(ts => `<option value="${ts}" ${ts === '4/4' ? 'selected' : ''}>${ts}</option>`).join('')}
                </select>
            </div>
            <div class="control-group">
                <label>Tuplets</label>
                <select class="tuplet-select" data-sequencer-id="${id}">
                    <option value="none">No Tuplets</option>
                    <option value="2:3">Duplet (2:3)</option>
                    <option value="3:2">Triplet (3:2)</option>
                    <option value="4:3">Quadruplet (4:3)</option>
                    <option value="5:4">Quintuplet (5:4)</option>
                    <option value="6:4">Sextuplet (6:4)</option>
                    <option value="7:4">Septuplet (7:4)</option>
                    <option value="8:6">Octuplet (8:6)</option>
                    <option value="9:8">Nonuplet (9:8)</option>
                    <option value="10:8">Decuplet (10:8)</option>
                    <option value="11:8">Undecuplet (11:8)</option>
                    <option value="12:8">Dodecuplet (12:8)</option>
                    <option value="13:8">Tredecuplet (13:8)</option>
                </select>
            </div>
            <div class="control-group">
                <label>Load Pattern</label>
                <select class="pattern-select" data-sequencer-id="${id}">
                    <option value="">--Select--</option>
                    ${Object.keys(RHYTHM_PATTERNS).map(p => `<option value="${p}">${p}</option>`).join('')}
                </select>
            </div>
            <button class="rnd-all-btn primary-action" data-sequencer-id="${id}">RND All</button>
            <button class="import-rhythm-btn" data-sequencer-id="${id}">Import</button>
            <button class="export-rhythm-btn" data-sequencer-id="${id}">Export</button>
            <button class="play-button" data-sequencer-id="${id}">Play</button>
        `;
        
        const gridDiv = document.createElement('div');
        gridDiv.className = 'sequencer-grid';
        
        sequencerDiv.append(header, gridDiv);
        sequencersContainer.appendChild(sequencerDiv);

        updateSequencerGrid(id, 16);
        addSequencerHeaderEventListeners(id);
    }

    function addSequencerHeaderEventListeners(id) {
        const header = document.querySelector(`#sequencer-${id} .sequencer-header`);
        header.querySelector('.remove-sequencer-btn').onclick = handleRemoveSequencer;
        header.querySelector('.hide-show-btn').onclick = (e) => {
            const grid = document.querySelector(`#sequencer-${id} .sequencer-grid`);
            grid.classList.toggle('hidden');
            e.target.textContent = grid.classList.contains('hidden') ? 'Show' : 'Hide';
        };
        header.querySelector('.sequencer-name').onchange = handleNameChange;
        header.querySelector('.steps-input').onchange = (e) => {
            const newSteps = parseInt(e.target.value, 10);
            if (newSteps >= 4 && newSteps <= 64) {
                sequencersData[id].steps = newSteps;
                updateSequencerGrid(id, newSteps);
                renderSongStructureVisual();
            }
        };
        header.querySelector('.time-signature-select').onchange = handleTimeSignatureChange;
        header.querySelector('.tuplet-select').onchange = (e) => {
            sequencersData[id].tuplet = e.target.value;
            updateBarHighlighting(id);
        };
        header.querySelector('.pattern-select').onchange = handlePatternLoad;
        header.querySelector('.rnd-all-btn').onclick = () => randomizeSequencer(id);
        header.querySelector('.import-rhythm-btn').onclick = handleImportRhythm;
        header.querySelector('.export-rhythm-btn').onclick = handleExportRhythm;
        header.querySelector('.play-button').onclick = () => togglePlay(id);
    }
    
    function handleRemoveSequencer(e) {
        const sequencerId = e.target.dataset.sequencerId;
        if (confirm(`Are you sure you want to remove sequencer "${sequencersData[sequencerId].name}"?`)) {
            if (document.querySelector(`.play-button[data-sequencer-id="${sequencerId}"]`)?.classList.contains('playing')) {
                stop();
            }
            delete sequencersData[sequencerId];
            document.getElementById(`sequencer-${sequencerId}`)?.remove();
            renderSongStructureVisual();
        }
    }
    
    function updateSequencerGrid(sequencerId, numSteps) {
        const gridDiv = document.querySelector(`#sequencer-${sequencerId} .sequencer-grid`);
        if (!gridDiv) return;
        gridDiv.innerHTML = '';
        
        const data = sequencersData[sequencerId];
        if (!data) return;

        const header = document.querySelector(`#sequencer-${sequencerId} .sequencer-header`);
        if (header) {
            header.querySelector('.steps-input').value = data.steps;
            header.querySelector('.time-signature-select').value = data.timeSignature;
            if (header.querySelector('.tuplet-select')) {
                header.querySelector('.tuplet-select').value = data.tuplet || 'none';
            }
        }

        INSTRUMENTS.forEach(instrument => {
            if (!data.grid[instrument]) data.grid[instrument] = Array(64).fill(false);
            if (!data.velocities[instrument]) data.velocities[instrument] = Array(64).fill(100);

            const row = document.createElement('div');
            row.className = 'instrument-row';

            const rowControls = document.createElement('div');
            rowControls.className = 'row-controls';
            rowControls.innerHTML = `
                <div class="row-controls-header">
                    <button class="instrument-label" data-instrument="${instrument}" data-sequencer-id="${sequencerId}">${getInstrumentDisplayName(instrument)}</button>
                    <button class="toggle-controls-btn">+/-</button>
                </div>
                <div class="extra-controls hidden">
                    <button class="toggle-velocity-btn" data-instrument="${instrument}" data-sequencer-id="${sequencerId}">Velocity</button>
                    <button class="rnd-row-btn" data-instrument="${instrument}" data-sequencer-id="${sequencerId}">RND</button>
                    <button class="clear-row-btn" data-instrument="${instrument}" data-sequencer-id="${sequencerId}">Clear</button>
                </div>
            `;

            const stepsContainer = document.createElement('div');
            stepsContainer.className = 'steps-container';
            for (let i = 0; i < numSteps; i++) {
                stepsContainer.innerHTML += `
                    <div class="step">
                        <input type="checkbox" class="step-checkbox" data-step="${i}" data-instrument="${instrument}" data-sequencer-id="${sequencerId}" ${data.grid[instrument][i] ? 'checked' : ''}>
                        <input type="range" class="velocity-slider hidden" min="1" max="127" value="${data.velocities[instrument][i]}" data-step="${i}" data-instrument="${instrument}" data-sequencer-id="${sequencerId}">
                    </div>
                `;
            }
            
            row.append(rowControls, stepsContainer);
            gridDiv.appendChild(row);
        });
        addGridEventListeners(sequencerId);
        updateBarHighlighting(sequencerId);
    }

    function handleTimeSignatureChange(e) {
        const sequencerId = e.target.dataset.sequencerId;
        const newSignature = e.target.value;
        sequencersData[sequencerId].timeSignature = newSignature;
        updateBarHighlighting(sequencerId);
    }

    function updateBarHighlighting(sequencerId) {
        const container = document.getElementById(`sequencer-${sequencerId}`);
        if (!container) return;

        container.querySelectorAll('.bar-start, .beat-marker').forEach(el => {
            el.classList.remove('bar-start', 'beat-marker');
        });
        
        const data = sequencersData[sequencerId];
        if (!data) return;

        const [beats, subdivision] = data.timeSignature.split('/').map(Number);
        
        let stepsPerBeat = subdivision === 8 ? 2 : 4;
        if (data.tuplet && data.tuplet !== 'none') {
            const [n, m] = data.tuplet.split(':').map(Number);
            if (n) {
                stepsPerBeat = n;
            }
        }

        const stepsPerBar = beats * stepsPerBeat;
        if (stepsPerBar <= 0) return;

        for (let i = 0; i < data.steps; i++) {
            const stepCheckboxes = container.querySelectorAll(`.step-checkbox[data-step="${i}"]`);
            if (stepCheckboxes.length === 0) continue;

            if (i % stepsPerBar === 0) {
                stepCheckboxes.forEach(cb => cb.classList.add('bar-start'));
            } 
            else if (i % stepsPerBeat === 0) {
                stepCheckboxes.forEach(cb => cb.classList.add('beat-marker'));
            }
        }
    }
    
    function addGridEventListeners(sequencerId) {
        const container = document.getElementById(`sequencer-${sequencerId}`);
        container.querySelectorAll('.step-checkbox').forEach(cb => cb.onchange = handleStepChange);
        container.querySelectorAll('.velocity-slider').forEach(vs => vs.oninput = handleVelocityChange);
        container.querySelectorAll('.instrument-label').forEach(label => label.onclick = handleLabelClick);
        container.querySelectorAll('.toggle-velocity-btn').forEach(btn => btn.onclick = handleVelocityToggle);
        container.querySelectorAll('.toggle-controls-btn').forEach(btn => btn.onclick = (e) => {
            e.target.closest('.row-controls').querySelector('.extra-controls').classList.toggle('hidden');
        });
        container.querySelectorAll('.rnd-row-btn').forEach(btn => btn.onclick = handleRandomizeRow);
        container.querySelectorAll('.clear-row-btn').forEach(btn => btn.onclick = handleClearRow);
    }

    function handleExportRhythm(e) {
        const sequencerId = e.target.dataset.sequencerId;
        const data = sequencersData[sequencerId];
        if (!data) return;

        const patternObject = {};
        INSTRUMENTS.forEach(instrument => {
            const stepData = data.grid[instrument].slice(0, data.steps);
            if (stepData.some(isActive => isActive)) {
                patternObject[instrument] = stepData.map(isActive => isActive ? 1 : 0);
            }
        });

        const exportData = {
            [data.name]: {
                steps: data.steps,
                timeSignature: data.timeSignature,
                tuplet: data.tuplet || 'none',
                pattern: patternObject
            }
        };
        
        const replacer = (key, value) => (Array.isArray(value) && INSTRUMENTS.includes(key)) ? `@@${JSON.stringify(value)}@@` : value;
        let jsonString = JSON.stringify(exportData, replacer, 2).replace(/"@@(.*?)@@"/g, '$1');

        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rhythm-${data.name}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function handleImportRhythm(e) {
        const sequencerId = e.target.dataset.sequencerId;
        promptForFile(fileContent => {
             try {
                const importedData = JSON.parse(fileContent);
                validateAndApplyRhythm(sequencerId, importedData);
             } catch(error) {
                alert(`Failed to import rhythm: ${error.message}`);
             }
        });
    }
    
    function validateAndApplyRhythm(sequencerId, importedData) {
        const patternName = Object.keys(importedData)[0];
        if (!patternName) throw new Error("No pattern name found.");

        const details = importedData[patternName];
        if (typeof details !== 'object' || details === null) throw new Error("Pattern details are missing.");
        
        const { steps, timeSignature, tuplet, pattern } = details;
        
        if (typeof steps !== 'number' || steps < 4 || steps > 64) throw new Error(`Invalid 'steps' value.`);
        if (!VALID_TIME_SIGNATURES.includes(timeSignature)) throw new Error(`Invalid time signature.`);
        if (typeof pattern !== 'object' || pattern === null) throw new Error("Pattern steps missing.");
        
        const data = sequencersData[sequencerId];
        data.steps = steps;
        data.timeSignature = timeSignature;
        data.tuplet = tuplet || 'none';
        
        INSTRUMENTS.forEach(inst => data.grid[inst].fill(false));
        
        for (const instrument in pattern) {
            if (INSTRUMENTS.includes(instrument)) {
                const stepArray = pattern[instrument];
                if (Array.isArray(stepArray)) {
                    for (let i = 0; i < data.steps && i < stepArray.length; i++) {
                        data.grid[instrument][i] = stepArray[i] === 1;
                    }
                }
            }
        }

        updateSequencerGrid(sequencerId, data.steps);
        renderSongStructureVisual();
        alert(`Rhythm '${patternName}' loaded successfully!`);
    }

    function handleInsertSequencers() {
        const amount = parseInt(sequencerAmountInput.value, 10);
        let nextCharIndex = 0;
        const existingNames = new Set(Object.values(sequencersData).map(s => s.name));
        
        for(let i = 0; i < amount; i++) {
            let newName;
            do {
                newName = String.fromCharCode(65 + nextCharIndex++);
            } while(existingNames.has(newName) || nextCharIndex > 26);
            
            if (nextCharIndex <= 26) {
                existingNames.add(newName);
                createSequencer(newName, newName);
            } else {
                alert("Maximum number of named sequencers (A-Z) reached.");
                break;
            }
        }
        renderSongStructureVisual();
    }
    
    function handleNameChange(e) {
        const newName = e.target.value.toUpperCase();
        const oldName = e.target.dataset.oldName;

        if (!/^[A-Z]$/.test(newName)) {
            alert(`Name must be a single letter (A-Z).`);
            e.target.value = oldName;
            return;
        }

        const isTaken = Object.values(sequencersData).some(data => data.name === newName && data.name !== oldName);
        if (isTaken) {
            alert(`Name "${newName}" is already in use.`);
            e.target.value = oldName;
            return;
        }
        sequencersData[e.target.dataset.sequencerId].name = newName;
        e.target.dataset.oldName = newName;
        renderSongStructureVisual();
    }

    function handleStepChange(e) { const { step, instrument, sequencerId } = e.target.dataset; sequencersData[sequencerId].grid[instrument][step] = e.target.checked; }
    function handleVelocityChange(e) { const { step, instrument, sequencerId } = e.target.dataset; sequencersData[sequencerId].velocities[instrument][step] = parseInt(e.target.value, 10); }
    
    function handleLabelClick(e) {
        const { instrument } = e.target.dataset;
        const settings = globalMixerSettings[instrument];
        playSample(instrument, settings.volume, settings.panning, 127, audioContext.currentTime, -1);
        liveRecordNote(instrument);
    }
    
    function handleVelocityToggle(e) {
        const row = e.target.closest('.instrument-row');
        row.querySelectorAll('.velocity-slider').forEach(slider => slider.classList.toggle('hidden'));
    }
    
    function handleRandomizeRow(e) {
        const { instrument, sequencerId } = e.target.dataset;
        const data = sequencersData[sequencerId];
        for (let i = 0; i < data.steps; i++) {
            data.grid[instrument][i] = Math.random() > 0.6;
        }
        updateSequencerGrid(sequencerId, data.steps);
    }
    
    function handleClearRow(e) {
        const { instrument, sequencerId } = e.target.dataset;
        sequencersData[sequencerId].grid[instrument].fill(false);
        updateSequencerGrid(sequencerId, sequencersData[sequencerId].steps);
    }
    
    function randomizeSequencer(sequencerId) {
         const data = sequencersData[sequencerId];
         INSTRUMENTS.forEach(instrument => data.grid[instrument].forEach((_, i) => data.grid[instrument][i] = Math.random() > 0.7));
         updateSequencerGrid(sequencerId, data.steps);
    }
    
    function applyPatternToSequencer(sequencerId, patternName) {
        if (!patternName || !RHYTHM_PATTERNS[patternName] || !sequencersData[sequencerId]) return;

        const patternData = RHYTHM_PATTERNS[patternName];
        const data = sequencersData[sequencerId];

        const newSteps = patternData.steps;
        const newTimeSignature = patternData.timeSignature;
        const patternGrid = patternData.pattern;

        data.steps = newSteps;
        data.timeSignature = newTimeSignature;
        data.tuplet = patternData.tuplet || 'none';

        updateSequencerGrid(sequencerId, newSteps);

        INSTRUMENTS.forEach(instrument => data.grid[instrument].fill(false));

        for (const instrument in patternGrid) {
            if (INSTRUMENTS.includes(instrument)) {
                if (!data.grid[instrument]) data.grid[instrument] = Array(64).fill(false);
                for (let i = 0; i < newSteps && i < patternGrid[instrument].length; i++) {
                    data.grid[instrument][i] = patternGrid[instrument][i] === 1;
                }
            }
        }
        
        updateSequencerGrid(sequencerId, newSteps);
        renderSongStructureVisual();
    }

    function handlePatternLoad(e) {
        const patternName = e.target.value;
        if (!patternName) return;
        const sequencerId = e.target.dataset.sequencerId;
        applyPatternToSequencer(sequencerId, patternName);
        e.target.value = "";
    }
    
    function generateRandomSong() {
        stop(); 

        const sequencerIds = Object.keys(sequencersData);
        const availablePatterns = Object.keys(RHYTHM_PATTERNS);

        if (sequencerIds.length === 0) {
            alert("Please add at least one sequencer before generating a song.");
            return;
        }
        if (availablePatterns.length === 0) {
            alert("No rhythm patterns loaded.");
            return;
        }

        sequencerIds.forEach(id => {
            const randomPatternName = availablePatterns[Math.floor(Math.random() * availablePatterns.length)];
            applyPatternToSequencer(id, randomPatternName);
        });

        let songStructureString = "<"; // Prepend intro by default
        const sequencerNames = Object.values(sequencersData).map(data => data.name);
        const numBlocks = Math.floor(Math.random() * 3) + 2;
        let availableNamesPool = [...sequencerNames];
        let lastName = null;

        for (let i = 0; i < numBlocks; i++) {
            if(availableNamesPool.length === 0) {
                availableNamesPool = [...sequencerNames];
            }
            
            let chosenName;
            let nameIndex;
            do {
                nameIndex = Math.floor(Math.random() * availableNamesPool.length);
                chosenName = availableNamesPool[nameIndex];
            } while (sequencerNames.length > 1 && chosenName === lastName);
            
            lastName = chosenName;
            availableNamesPool.splice(nameIndex, 1);

            // Build transitions with crash accent modifiers
            songStructureString += "+" + chosenName.repeat(4);
            const randomFillLength = Math.floor(Math.random() * 5) + 3; // Fills of 3-7 steps
            songStructureString += randomFillLength;
        }
        
        songStructureString += ">"; // Append outro beat

        songStructureInput.value = songStructureString;
        bpm = Math.floor(Math.random() * 101) + 80;
        tempoInput.value = bpm;
        renderSongStructureVisual();
    }

    function visualizeHit(instrument) {
        const visualInstrument = VISUAL_MAP[instrument];
        if (!visualInstrument) return;

        const el = document.getElementById(`vis-${visualInstrument}`);
        if (el) {
            el.classList.add('hit');
            setTimeout(() => {
                el.classList.remove('hit');
            }, 100);
        }
    }
    
    function liveRecordNote(instrument) {
        if (isPlaying && !isSongPlaying) {
            const playingBtn = document.querySelector('.play-button.playing');
            const sequencerId = playingBtn ? playingBtn.dataset.sequencerId : null;
            
            if (sequencerId && instrument) {
                const stepCheckbox = document.querySelector(`.step-checkbox[data-sequencer-id="${sequencerId}"][data-instrument="${instrument}"][data-step="${currentStep}"]`);
                if (stepCheckbox && !stepCheckbox.checked) {
                    stepCheckbox.checked = true;
                    stepCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        }
    }

    function playSample(instrument, volume, panning = 0, velocity = 127, scheduledTime, step) {
        visualizeHit(instrument);

        if (!audioContext || !audioBuffers[instrument] || audioBuffers[instrument].length === 0) return;

        // Round Robin selection
        if (roundRobinIndices[instrument] === undefined) roundRobinIndices[instrument] = 0;
        const rrIndex = roundRobinIndices[instrument];
        const buffer = audioBuffers[instrument][rrIndex];
        roundRobinIndices[instrument] = (rrIndex + 1) % audioBuffers[instrument].length;

        const source = audioContext.createBufferSource();
        source.buffer = buffer;

        // 1. Calculate dynamic lowpass cutoff based on velocity (Range: 150Hz to 20kHz)
        const velocityRatio = velocity / 127;
        let finalCutoff = 150 + Math.pow(velocityRatio, 2) * 19850;

        let timeOffset = 0;
        const sixteenthNoteTime = (60.0 / bpm) / 4.0;
        if (step >= 0) {
            if (swingAmount > 0 && step % 2 !== 0) {
                const delay = swingAmount * 2 * sixteenthNoteTime;
                timeOffset += delay;
            }
            
            if (isHumanizeOn && timingHumanizeAmount > 0) {
                const timingVariation = (Math.random() - 0.5) * (sixteenthNoteTime * 0.5) * timingHumanizeAmount;
                timeOffset += timingVariation;
            }
        }

        // 2. Machine Gun prevention if only one sample is loaded
        const isSingleSample = audioBuffers[instrument].length === 1;
        if (isSingleSample) {
            // Modulate pitch slightly (±3%)
            source.playbackRate.setValueAtTime(1.0 + (Math.random() - 0.5) * 0.06, (scheduledTime || audioContext.currentTime) + timeOffset);
            // Modulate cutoff slightly (±5%)
            const cutoffVariation = 1.0 + (Math.random() - 0.5) * 0.1;
            finalCutoff = Math.max(150, Math.min(20000, finalCutoff * cutoffVariation));
            // Microtiming delays micro-shift: 0 to 4ms
            timeOffset += Math.random() * 0.004;
        }

        if (isHumanizeOn && velocityHumanizeAmount > 0) {
            const randFactor = 1.0 + (Math.random() - 0.5) * 0.1 * velocityHumanizeAmount;
            finalCutoff = Math.max(150, Math.min(20000, finalCutoff * randFactor));
        }

        // Create lowpass filter for velocity-sensitivity
        const velocityFilter = audioContext.createBiquadFilter();
        velocityFilter.type = 'lowpass';
        velocityFilter.frequency.setValueAtTime(finalCutoff, (scheduledTime || audioContext.currentTime) + timeOffset);

        const pannerNode = audioContext.createStereoPanner();
        pannerNode.pan.setValueAtTime(panning, (scheduledTime || audioContext.currentTime) + timeOffset);

        const gainNode = audioContext.createGain();
        let finalVolume = volume * velocityRatio * masterVolume.value;

        if (isHumanizeOn && velocityHumanizeAmount > 0) {
            const velocityVariation = ((Math.random() - 0.5) * 2 * 0.15 * velocityHumanizeAmount);
            finalVolume = Math.max(0, finalVolume + velocityVariation);
        }
        if (isSingleSample) {
            // Organic volume variance for repeated hits
            const volumeVariance = (Math.random() - 0.5) * 0.05;
            finalVolume = Math.max(0, finalVolume + volumeVariance);
        }
        gainNode.gain.setValueAtTime(Math.min(1.0, finalVolume), (scheduledTime || audioContext.currentTime) + timeOffset);

        // Routing Path: Source -> Filter -> Panner -> Gain -> FX Rack/Destination
        if (masteringProcessor) {
            source.connect(velocityFilter).connect(pannerNode).connect(gainNode).connect(masteringProcessor.input);
        } else {
            source.connect(velocityFilter).connect(pannerNode).connect(gainNode).connect(audioContext.destination);
        }

        const startTime = (scheduledTime || audioContext.currentTime) + timeOffset;
        source.start(startTime);
    }

    function parseSongStructure(str) {
        const tokens = [];
        let i = 0;
        let applyCrashAccentNext = false;
        let currentTransitionSteps = null;
        
        while (i < str.length) {
            let char = str[i];
            if (char === '+') {
                applyCrashAccentNext = true;
                i++;
                continue;
            }
            if (char === '<') {
                tokens.push({ type: 'intro', steps: 16, crashAccent: applyCrashAccentNext });
                applyCrashAccentNext = false;
                i++;
                continue;
            }
            if (char === '>') {
                tokens.push({ type: 'outro', steps: 16, crashAccent: applyCrashAccentNext });
                applyCrashAccentNext = false;
                i++;
                continue;
            }
            if (char === "'") {
                let j = i + 1;
                let tempoStr = "";
                while (j < str.length && str[j] !== "'") {
                    tempoStr += str[j];
                    j++;
                }
                const tempoVal = parseInt(tempoStr, 10);
                if (!isNaN(tempoVal)) {
                    tokens.push({ type: 'tempo_change', bpm: tempoVal, transitionSteps: currentTransitionSteps });
                }
                currentTransitionSteps = null;
                i = j + 1;
                continue;
            }
            if (char === '*') {
                let j = i + 1;
                let stepStr = "";
                while (j < str.length && str[j] !== '*') {
                    stepStr += str[j];
                    j++;
                }
                const stepsVal = parseInt(stepStr, 10);
                if (!isNaN(stepsVal)) {
                    currentTransitionSteps = stepsVal;
                }
                i = j + 1;
                continue;
            }
            if (/[A-Z]/.test(char)) {
                tokens.push({ type: 'pattern', name: char, crashAccent: applyCrashAccentNext });
                applyCrashAccentNext = false;
                i++;
                continue;
            }
            if (/[1-9]/.test(char)) {
                tokens.push({ type: 'fill', steps: parseInt(char, 10), crashAccent: applyCrashAccentNext });
                applyCrashAccentNext = false;
                i++;
                continue;
            }
            i++;
        }
        return tokens;
    }

    function compileSongBlocks(tokens) {
        const blocks = [];
        let currentBpm = bpm;
        let pendingBpm = null;
        let pendingTransition = null;

        tokens.forEach(token => {
            if (token.type === 'tempo_change') {
                pendingBpm = token.bpm;
                pendingTransition = token.transitionSteps;
            } else {
                blocks.push({
                    type: token.type,
                    name: token.name || null,
                    steps: token.steps || 16,
                    crashAccent: token.crashAccent || false,
                    bpm: pendingBpm !== null ? pendingBpm : currentBpm,
                    transitionSteps: pendingTransition
                });
                if (pendingBpm !== null) {
                    currentBpm = pendingBpm;
                    pendingBpm = null;
                    pendingTransition = null;
                }
            }
        });

        for (let i = 0; i < blocks.length; i++) {
            if (blocks[i].type === 'pattern' && randomFillsEnabled) {
                if (i + 1 < blocks.length && blocks[i + 1].type === 'fill') {
                    const fillSteps = blocks[i + 1].steps;
                    if (fillSteps <= blocks[i].steps) {
                        blocks[i].steps -= fillSteps;
                    }
                }
            }
        }
        return blocks;
    }

    function renderSongStructureVisual() {
        const container = document.getElementById('song-structure-visual');
        container.innerHTML = '';
        const raw = songStructureInput.value;
        const tokens = parseSongStructure(raw);
        const blocks = compileSongBlocks(tokens);
        
        blocks.forEach((block, index) => {
            const span = document.createElement('span');
            span.className = 'visual-block';
            span.dataset.index = index;
            
            let label = "";
            if (block.type === 'pattern') label = block.name;
            else if (block.type === 'intro') label = '<';
            else if (block.type === 'outro') label = '>';
            else if (block.type === 'fill') label = `Fill(${block.steps})`;
            
            if (block.crashAccent) label = '+' + label;
            if (block.transitionSteps) label += ` [BPM:${block.bpm} over *${block.transitionSteps}*]`;
            else if (block.bpm !== bpm && (index === 0 || blocks[index-1].bpm !== block.bpm)) label += ` [BPM:${block.bpm}]`;
            
            span.textContent = label;
            container.appendChild(span);
        });
        
        totalSongDuration = 0;
        let tempPreviousBpm = bpm;
        blocks.forEach(block => {
            const targetBpm = block.bpm;
            const steps = block.steps;
            const transitionSteps = block.transitionSteps;
            for (let s = 0; s < steps; s++) {
                let stepBpm = targetBpm;
                if (transitionSteps && s < transitionSteps) {
                    stepBpm = tempPreviousBpm + (targetBpm - tempPreviousBpm) * (s / transitionSteps);
                }
                totalSongDuration += (60.0 / stepBpm) / 4.0;
            }
            tempPreviousBpm = targetBpm;
        });
    }

    function scheduler() { while (nextNoteTime < audioContext.currentTime + scheduleAheadTime) { scheduleNote(currentStep, nextNoteTime); nextNote(); } }
    
    function nextNote() {
        let stepBpm = bpm;
        if (isSongPlaying) {
            const currentBlock = songBlocks[currentSongSectionIndex];
            if (currentBlock) {
                stepBpm = currentBlock.bpm;
                if (currentBlock.transitionSteps && currentStep < currentBlock.transitionSteps) {
                    stepBpm = previousBpm + (currentBlock.bpm - previousBpm) * (currentStep / currentBlock.transitionSteps);
                }
            }
        }

        const timePerStep = (60.0 / stepBpm) / 4.0;
        nextNoteTime += timePerStep;

        let numSteps = 16;
        if (isSongPlaying) {
            const currentBlock = songBlocks[currentSongSectionIndex];
            if (currentBlock) numSteps = currentBlock.steps;
        } else {
            const activeId = document.querySelector('.play-button.playing')?.dataset.sequencerId;
            if (activeId && sequencersData[activeId]) {
                numSteps = sequencersData[activeId].steps;
            }
        }

        currentStep++;
        if (currentStep >= numSteps) {
            currentStep = 0;

            if (isSongPlaying) {
                previousBpm = songBlocks[currentSongSectionIndex].bpm;
                currentSongSectionIndex++;
                
                if (currentSongSectionIndex >= songBlocks.length) {
                    currentSongSectionIndex = 0;
                    previousBpm = bpm; // Loop song
                }

                const currentBlock = songBlocks[currentSongSectionIndex];
                if (currentBlock) {
                    if (currentBlock.type === 'fill') {
                        currentFillPattern = generateFillPattern(currentBlock.steps);
                    } else if (currentBlock.type === 'pattern') {
                        const seqEntry = Object.entries(sequencersData).find(([id, data]) => data.name === currentBlock.name);
                        if (seqEntry) currentSongSequencerId = seqEntry[0];
                    }
                }
            }
        }
    }
    
    function generateFillPattern(numSteps) {
        const fillGrid = {};
        INSTRUMENTS.forEach(instrument => {
            fillGrid[instrument] = Array(numSteps).fill(false);
        });
        for (let i = 0; i < numSteps; i++) {
            if (Math.random() > 0.4) {
                const randomInstrument = FILL_INSTRUMENTS[Math.floor(Math.random() * FILL_INSTRUMENTS.length)];
                fillGrid[randomInstrument][i] = true;
            }
        }
        return fillGrid;
    }

    function scheduleNote(step, time) {
        if (isSongPlaying) {
            const currentBlock = songBlocks[currentSongSectionIndex];
            if (!currentBlock) return;

            if (currentBlock.type === 'intro') {
                if (step === 0 || step === 4 || step === 8 || step === 12) {
                    const settings = globalMixerSettings['hi-hat-open'];
                    playSample('hi-hat-open', settings.volume, settings.panning, 100, time, -1);
                }
                setTimeout(() => updatePlayhead(-1, null), (time - audioContext.currentTime) * 1000);
                return;
            }

            if (currentBlock.type === 'outro') {
                if (step === 0) {
                    const kickSet = globalMixerSettings['kick'];
                    const crashSet = globalMixerSettings['crash1'];
                    playSample('kick', kickSet.volume, kickSet.panning, 110, time, -1);
                    playSample('crash1', crashSet.volume, crashSet.panning, 120, time, -1);
                }
                setTimeout(() => updatePlayhead(-1, null), (time - audioContext.currentTime) * 1000);
                return;
            }

            let gridToUse = null;
            if (currentBlock.type === 'fill') {
                gridToUse = currentFillPattern;
            } else if (currentBlock.type === 'pattern') {
                const seq = Object.values(sequencersData).find(s => s.name === currentBlock.name);
                if (seq) gridToUse = seq.grid;
            }

            if (!gridToUse) return;

            let suppressCymbals = false;
            if (step === 0 && currentBlock.crashAccent) {
                suppressCymbals = true;
                const crashSet = globalMixerSettings['crash1'];
                playSample('crash1', crashSet.volume, crashSet.panning, 127, time, step);
            }

            INSTRUMENTS.forEach(instrument => {
                if (gridToUse[instrument] && gridToUse[instrument][step]) {
                    if (suppressCymbals && ['crash1', 'crash2', 'ride', 'china', 'hi-hat-open', 'hi-hat-closed'].includes(instrument)) {
                        return;
                    }
                    const settings = globalMixerSettings[instrument];
                    const seq = Object.values(sequencersData).find(s => s.name === currentBlock.name);
                    const velocity = (seq && seq.velocities[instrument]) ? seq.velocities[instrument][step] : 100;
                    playSample(instrument, settings.volume, settings.panning, velocity, time, step);
                }
            });

            if (currentBlock.type === 'pattern') {
                setTimeout(() => updatePlayhead(step, currentSongSequencerId), (time - audioContext.currentTime) * 1000);
            } else {
                setTimeout(() => updatePlayhead(-1, null), (time - audioContext.currentTime) * 1000);
            }

        } else {
            const playingBtn = document.querySelector('.play-button.playing');
            const activeSequencerId = playingBtn ? playingBtn.dataset.sequencerId : null;
            if (!activeSequencerId || !sequencersData[activeSequencerId]) return;

            const data = sequencersData[activeSequencerId];
            INSTRUMENTS.forEach(instrument => {
                if (data.grid[instrument] && data.grid[instrument][step]) {
                    const velocity = data.velocities[instrument][step];
                    const settings = globalMixerSettings[instrument];
                    playSample(instrument, settings.volume, settings.panning, velocity, time, step);
                }
            });
            setTimeout(() => updatePlayhead(step, activeSequencerId), (time - audioContext.currentTime) * 1000);
        }
    }

    let lastPlayhead = { step: -1, id: null };
    function updatePlayhead(step, sequencerId) {
         if (lastPlayhead.id && document.getElementById(`sequencer-${lastPlayhead.id}`)) {
            document.querySelectorAll(`.step-checkbox[data-sequencer-id="${lastPlayhead.id}"][data-step="${lastPlayhead.step}"]`).forEach(el => el.classList.remove('playing'));
         }
         if (sequencerId && document.getElementById(`sequencer-${sequencerId}`)) {
            document.querySelectorAll(`.step-checkbox[data-sequencer-id="${sequencerId}"][data-step="${step}"]`).forEach(el => el.classList.add('playing'));
            lastPlayhead = { step, id: sequencerId };
         } else {
            lastPlayhead = { step: -1, id: null };
         }
    }
    
    async function togglePlay(sequencerId, isSongMode = false) {
         await initAudio();
         
         if (isPlaying) {
             const wasSongPlaying = isSongPlaying;
             const wasPlayingId = lastPlayhead.id;
             stop();
             if ((isSongMode && !wasSongPlaying) || (!isSongMode && sequencerId !== wasPlayingId)) {
                 setTimeout(() => togglePlay(sequencerId, isSongMode), 50);
             }
             return;
         }

         if (audioContext.state === 'suspended') await audioContext.resume();
         
         isPlaying = true;
         isSongPlaying = isSongMode;
         
         if (isSongMode) {
             playbackPhase = 'song';
             songPlayBtn.classList.add('playing');
             songPlayBtn.textContent = 'Song Stop';
         } else {
             playbackPhase = 'song';
             const playBtn = document.querySelector(`.play-button[data-sequencer-id="${sequencerId}"]`);
             if (playBtn) { playBtn.classList.add('playing'); playBtn.textContent = 'Stop'; }
         }
         
         currentStep = -1;
         nextNoteTime = audioContext.currentTime;
         previousBpm = bpm;
         schedulerTimerID = setInterval(scheduler, 25.0);
         requestAnimationFrame(updateDisplayLoop);
    }

    function stop() {
        isPlaying = false; 
        isSongPlaying = false;
        isPlayingFill = false;
        playbackPhase = 'stopped';
        currentFillPattern = null;
        clearInterval(schedulerTimerID);
        
        document.querySelectorAll('.play-button').forEach(b => { 
            b.classList.remove('playing');
            if(b.id === 'song-play-btn') b.textContent = 'Song Play';
            else if (b.dataset.sequencerId) b.textContent = 'Play';
        });

        updatePlayhead(-1, null);
        currentStep = 0;
        updateDisplayLoop(); // reset visuals
    }

    function updateDisplayLoop() {
        if (!isPlaying) {
            document.getElementById('display-active-seq').textContent = '-';
            document.getElementById('display-seq-time').textContent = '0:00.0 / 0:00.0';
            document.getElementById('display-song-time').textContent = '0:00.0 / 0:00.0';
            document.querySelectorAll('#song-structure-visual .visual-block').forEach(el => el.classList.remove('active'));
            return;
        }
        requestAnimationFrame(updateDisplayLoop);
        
        let activeName = '-';
        let seqDuration = 0.0;
        let currentSeqTime = 0.0;
        
        if (isSongPlaying) {
            const currentBlock = songBlocks[currentSongSectionIndex];
            if (currentBlock) {
                if (currentBlock.type === 'pattern') activeName = currentBlock.name;
                else if (currentBlock.type === 'intro') activeName = '<';
                else if (currentBlock.type === 'outro') activeName = '>';
                else if (currentBlock.type === 'fill') activeName = 'Fill';

                const currentBlockBpm = currentBlock.bpm;
                const stepDur = (60.0 / currentBlockBpm) / 4.0;
                seqDuration = currentBlock.steps * stepDur;
                currentSeqTime = currentStep * stepDur;
            }
            
            document.querySelectorAll('#song-structure-visual .visual-block').forEach((el, index) => {
                if (index === currentSongSectionIndex) {
                    el.classList.add('active');
                } else {
                    el.classList.remove('active');
                }
            });
            
            let elapsed = 0.0;
            let tempPreviousBpm = bpm;
            for (let b = 0; b < currentSongSectionIndex; b++) {
                const block = songBlocks[b];
                const targetBpm = block.bpm;
                const steps = block.steps;
                const transitionSteps = block.transitionSteps;
                for (let s = 0; s < steps; s++) {
                    let stepBpm = targetBpm;
                    if (transitionSteps && s < transitionSteps) {
                        stepBpm = tempPreviousBpm + (targetBpm - tempPreviousBpm) * (s / transitionSteps);
                    }
                    elapsed += (60.0 / stepBpm) / 4.0;
                }
                tempPreviousBpm = targetBpm;
            }
            
            if (currentBlock) {
                const targetBpm = currentBlock.bpm;
                const transitionSteps = currentBlock.transitionSteps;
                for (let s = 0; s < currentStep; s++) {
                    let stepBpm = targetBpm;
                    if (transitionSteps && s < transitionSteps) {
                        stepBpm = previousBpm + (targetBpm - previousBpm) * (s / transitionSteps);
                    }
                    elapsed += (60.0 / stepBpm) / 4.0;
                }
            }
            
            document.getElementById('display-active-seq').textContent = activeName;
            document.getElementById('display-seq-time').textContent = `${formatTime(currentSeqTime)} / ${formatTime(seqDuration)}`;
            document.getElementById('display-song-time').textContent = `${formatTime(elapsed)} / ${formatTime(totalSongDuration)}`;
        } else {
            const playingBtn = document.querySelector('.play-button.playing');
            const id = playingBtn?.dataset.sequencerId;
            if (id && sequencersData[id]) {
                const seq = sequencersData[id];
                activeName = seq.name;
                const stepDur = (60.0 / bpm) / 4.0;
                seqDuration = seq.steps * stepDur;
                currentSeqTime = currentStep * stepDur;
                
                document.getElementById('display-active-seq').textContent = activeName;
                document.getElementById('display-seq-time').textContent = `${formatTime(currentSeqTime)} / ${formatTime(seqDuration)}`;
                document.getElementById('display-song-time').textContent = `${formatTime(currentSeqTime)} / ${formatTime(seqDuration)}`;
            }
        }
    }
    
    function formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return "0:00.0";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const tenths = Math.floor((seconds % 1) * 10);
        return `${mins}:${secs.toString().padStart(2, '0')}.${tenths}`;
    }

    function playSong() {
        if (isSongPlaying) {
            stop();
            return;
        }
        try {
            const raw = songStructureInput.value;
            if(!raw) { alert('Please enter a song structure (e.g., <+A4B>).'); return; }

            const tokens = parseSongStructure(raw);
            songBlocks = compileSongBlocks(tokens);

            if (!songBlocks.length) {
                throw new Error("No playable segments parsed.");
            }
            
            currentSongSectionIndex = 0;
            previousBpm = bpm;

            const firstBlock = songBlocks[0];
            if (firstBlock.type === 'intro' || firstBlock.type === 'outro' || firstBlock.type === 'fill') {
                if (firstBlock.type === 'fill') {
                    currentFillPattern = generateFillPattern(firstBlock.steps);
                }
                togglePlay(null, true);
            } else if (firstBlock.type === 'pattern') {
                const nextSequencer = Object.entries(sequencersData).find(([id, data]) => data.name === firstBlock.name);
                if (nextSequencer) {
                    currentSongSequencerId = nextSequencer[0];
                    togglePlay(null, true);
                } else {
                    throw new Error(`Sequencer pattern "${firstBlock.name}" not found.`);
                }
            }
        } catch(error) {
            alert("Playback aborted: " + error.message);
            stop();
        }
    }

    let lastTap = 0; let tapTimes = [];
    function tapTempo() {
        const now = Date.now();
        if (now - lastTap > 2000) tapTimes = [];
        lastTap = now; tapTimes.push(now);
        if (tapTimes.length > 4) tapTimes.shift();
        if (tapTimes.length > 1) {
            const average = (tapTimes[tapTimes.length - 1] - tapTimes[0]) / (tapTimes.length - 1);
            bpm = Math.max(20, Math.min(300, Math.round(60000 / average)));
            tempoInput.value = bpm;
            renderSongStructureVisual();
        }
    }
    
    function initMidi() {
        if (navigator.requestMIDIAccess) navigator.requestMIDIAccess({ sysex: false }).then(onMIDISuccess, onMIDIFailure);
        else alert("Web MIDI API is not supported.");
    }
    function onMIDISuccess(m) {
        midiAccess = m;
        midiInSelect.innerHTML = midiAccess.inputs.size > 0 ? '<option value="">Select MIDI Input...</option>' + [...midiAccess.inputs.values()].map(i => `<option value="${i.id}">${i.name}</option>`).join('') : '<option>No MIDI Input</option>';
        midiOutSelect.innerHTML = midiAccess.outputs.size > 0 ? '<option value="">Select MIDI Output...</option>' + [...midiAccess.outputs.values()].map(o => `<option value="${o.id}">${o.name}</option>`).join('') : '<option>No MIDI Output</option>';
    }
    function onMIDIFailure(msg) { console.error(`MIDI failure - ${msg}`); }
    function selectMidiInput(e) {
        if (currentMidiInput) currentMidiInput.onmidimessage = null;
        currentMidiInput = e.target.value ? midiAccess.inputs.get(e.target.value) : null;
        if (currentMidiInput) currentMidiInput.onmidimessage = handleMidiMessage;
    }
    async function handleMidiMessage(message) {
        await initAudio();
        const [command, note, velocity] = message.data;
        if ((command & 0xF0) === 0x90 && velocity > 0) {
            const instrument = midiNoteToInstrumentMap[note];
            if (instrument) {
                const settings = globalMixerSettings[instrument] || { volume: 0.8, panning: 0 };
                playSample(instrument, settings.volume, settings.panning, velocity, audioContext.currentTime, -1);
                liveRecordNote(instrument);
            }
        }
    }
    
    function loadExampleSongs() {
        exampleSongsData = window.EXAMPLE_SONGS_DATA || {};
        for (const songName in exampleSongsData) {
            const option = document.createElement('option');
            option.value = songName;
            option.textContent = songName;
            exampleSongSelect.appendChild(option);
        }
    }
    
    function clearAllSequencers() {
        if(isPlaying) stop();
        sequencersContainer.innerHTML = '';
        sequencersData = {};
        renderSongStructureVisual();
    }

    function handleLoadExampleSong(e) {
        const songName = e.target.value;
        if (!songName) return;

        stop();
        clearAllSequencers();
        
        const songData = exampleSongsData[songName];
        if (!songData) return;

        if (songData.patterns) {
            for (const patternName in songData.patterns) {
                 createSequencer(patternName, patternName);
            }
        }
        
        if (songData.patterns) {
            for (const patternName in songData.patterns) {
                const patternDetails = songData.patterns[patternName];
                const data = sequencersData[patternName];
                if (!data) continue;
                
                data.steps = patternDetails.steps || 16;
                data.timeSignature = patternDetails.timeSignature || '4/4';
                data.tuplet = patternDetails.tuplet || 'none';
                
                const patternGrid = patternDetails.pattern;
                for (const instrument in patternGrid) {
                    if (INSTRUMENTS.includes(instrument)) {
                        for (let i = 0; i < data.steps && i < patternGrid[instrument].length; i++) {
                            data.grid[instrument][i] = patternGrid[instrument][i] === 1;
                        }
                    }
                }
                updateSequencerGrid(patternName, data.steps);
            }
        }
        
        tempoInput.value = songData.bpm;
        bpm = songData.bpm;
        songStructureInput.value = songData.structure;
        renderSongStructureVisual();
        e.target.value = "";
    }

    function createGlobalMixerPanel() {
        const panel = document.getElementById('global-mix-panel');
        panel.innerHTML = '';

        // Add mixer control headers
        const header = document.createElement('div');
        header.className = 'mix-panel-header';
        header.innerHTML = `
            <div style="font-weight: bold; font-size: 1.2em;">Channel Strips & Management</div>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button id="add-custom-instrument-btn" class="primary-action">Add Custom Instrument</button>
                <button id="export-sample-set-btn">Export Sample Set</button>
                <button id="import-sample-set-btn">Import Sample Set</button>
            </div>
        `;
        panel.appendChild(header);

        panel.querySelector('#add-custom-instrument-btn').onclick = handleAddCustomInstrument;
        panel.querySelector('#export-sample-set-btn').onclick = exportSampleSet;
        panel.querySelector('#import-sample-set-btn').onclick = importSampleSet;

        INSTRUMENTS.forEach(instrument => {
            const settings = globalMixerSettings[instrument] || { volume: 0.8, panning: 0 };
            const isCustom = !DEFAULT_INSTRUMENTS.includes(instrument);
            const strip = document.createElement('div');
            strip.className = 'mix-strip';
            strip.innerHTML = `
                <div class="instrument-name">${getInstrumentDisplayName(instrument)}</div>
                <label class="vol-label">Volume</label>
                <label class="pan-label">Pan</label>
                <input type="range" class="global-volume-slider" data-instrument="${instrument}" min="0" max="1" step="0.01" value="${settings.volume}">
                <input type="range" class="global-panning-slider" data-instrument="${instrument}" min="-1" max="1" step="0.01" value="${settings.panning}">
                <button class="sample-import-btn" data-instrument="${instrument}">Import Sound</button>
                ${isCustom ? `<button class="instrument-remove-btn" data-instrument="${instrument}">X</button>` : '<div></div>'}
            `;
            panel.appendChild(strip);
        });

        panel.querySelectorAll('.global-volume-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const instrument = e.target.dataset.instrument;
                globalMixerSettings[instrument].volume = parseFloat(e.target.value);
            });
        });
        panel.querySelectorAll('.global-panning-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const instrument = e.target.dataset.instrument;
                globalMixerSettings[instrument].panning = parseFloat(e.target.value);
            });
        });
        
        bindSampleFileLoaders(panel);
        
        panel.querySelectorAll('.instrument-remove-btn').forEach(btn => {
            btn.onclick = (e) => {
                const instrument = e.target.dataset.instrument;
                if (confirm(`Are you sure you want to remove custom instrument "${getInstrumentDisplayName(instrument)}"?`)) {
                    removeCustomInstrumentFromState(instrument);
                    createGlobalMixerPanel();
                    updateAllSequencerGrids();
                    renderSongStructureVisual();
                }
            };
        });
    }

    function bindSampleFileLoaders(panel) {
        panel.querySelectorAll('.sample-import-btn').forEach(btn => {
            btn.onclick = (e) => {
                const instrument = e.target.dataset.instrument;
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.multiple = true;
                fileInput.accept = 'audio/wav, audio/mp3, audio/mpeg, audio/ogg';
                fileInput.onchange = async (event) => {
                    if (!event.target.files.length) return;
                    const files = event.target.files;
                    await initAudio();
                    
                    audioBuffers[instrument] = [];
                    
                    const firstFile = files[0];
                    const baseName = firstFile.name.substring(0, firstFile.name.lastIndexOf('.')) || firstFile.name;
                    instrumentNames[instrument] = baseName;

                    let loadedCount = 0;
                    for (let file of files) {
                        const reader = new FileReader();
                        reader.onload = async (readEvent) => {
                            try {
                                const arrayBuffer = readEvent.target.result;
                                const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);
                                audioBuffers[instrument].push(decodedBuffer);
                                
                                loadedCount++;
                                if (loadedCount === files.length) {
                                    updateInstrumentLabels();
                                    alert(`Loaded ${files.length} custom sample(s) for ${baseName}!`);
                                }
                            } catch (err) {
                                alert("Audio decoding failed.");
                            }
                        };
                        reader.readAsArrayBuffer(file);
                    }
                };
                fileInput.click();
            };
        });
    }

    function handleAddCustomInstrument() {
        const name = prompt("Enter a name for the new custom instrument:");
        if (!name) return;
        
        const sanitizedName = name.trim();
        if (!sanitizedName) return;

        const id = "custom_" + Date.now();
        instrumentNames[id] = sanitizedName;
        INSTRUMENTS.push(id);
        
        globalMixerSettings[id] = { volume: 0.8, panning: 0 };
        audioBuffers[id] = [];
        
        for (const seqId in sequencersData) {
            sequencersData[seqId].grid[id] = Array(64).fill(false);
            sequencersData[seqId].velocities[id] = Array(64).fill(100);
        }
        
        createGlobalMixerPanel();
        updateAllSequencerGrids();
        renderSongStructureVisual();
    }

    function removeCustomInstrumentFromState(id) {
        const idx = INSTRUMENTS.indexOf(id);
        if (idx !== -1) {
            INSTRUMENTS.splice(idx, 1);
        }
        delete globalMixerSettings[id];
        delete audioBuffers[id];
        delete instrumentNames[id];
        delete roundRobinIndices[id];
        
        for (const seqId in sequencersData) {
            delete sequencersData[seqId].grid[id];
            delete sequencersData[seqId].velocities[id];
        }
    }

    function updateAllSequencerGrids() {
        for (const seqId in sequencersData) {
            updateSequencerGrid(seqId, sequencersData[seqId].steps);
        }
    }

    async function exportSampleSet() {
        try {
            if (!window.showDirectoryPicker) {
                alert("File System Access API is not supported in this browser. Please use Chrome, Edge, or Opera.");
                return;
            }
            const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            
            const manifest = {
                version: 1,
                instrumentNames: instrumentNames,
                globalMixerSettings: globalMixerSettings,
                customInstruments: INSTRUMENTS.filter(id => !DEFAULT_INSTRUMENTS.includes(id)),
                mappings: {}
            };
            
            for (const inst of INSTRUMENTS) {
                manifest.mappings[inst] = [];
                const buffers = audioBuffers[inst] || [];
                for (let i = 0; i < buffers.length; i++) {
                    const buffer = buffers[i];
                    const filename = `${inst}_${i}.wav`;
                    manifest.mappings[inst].push(filename);
                    
                    const wavBytes = SongDrumMachineExporter.bufferToWav(buffer);
                    
                    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(wavBytes);
                    await writable.close();
                }
            }
            
            const manifestString = JSON.stringify(manifest, null, 2);
            const manifestHandle = await dirHandle.getFileHandle("manifest.json", { create: true });
            const writable = await manifestHandle.createWritable();
            await writable.write(manifestString);
            await writable.close();
            
            alert("Sample set exported successfully into the chosen directory!");
        } catch (err) {
            console.error(err);
            alert("Failed to export sample set: " + err.message);
        }
    }

    async function importSampleSet() {
        try {
            if (!window.showDirectoryPicker) {
                alert("File System Access API is not supported in this browser. Please use Chrome, Edge, or Opera.");
                return;
            }
            const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
            
            const manifestHandle = await dirHandle.getFileHandle("manifest.json");
            const manifestFile = await manifestHandle.getFile();
            const manifestText = await manifestFile.text();
            const manifest = JSON.parse(manifestText);
            
            if (manifest.version !== 1) {
                throw new Error("Unsupported manifest version.");
            }
            
            stop();
            
            const customToRemove = INSTRUMENTS.filter(id => !DEFAULT_INSTRUMENTS.includes(id));
            customToRemove.forEach(removeCustomInstrumentFromState);
            
            if (manifest.customInstruments) {
                manifest.customInstruments.forEach(id => {
                    INSTRUMENTS.push(id);
                });
            }
            
            Object.assign(instrumentNames, manifest.instrumentNames || {});
            Object.assign(globalMixerSettings, manifest.globalMixerSettings || {});
            
            await initAudio();
            
            for (const inst of INSTRUMENTS) {
                audioBuffers[inst] = [];
                const filesList = manifest.mappings[inst] || [];
                for (const filename of filesList) {
                    try {
                        const fileHandle = await dirHandle.getFileHandle(filename);
                        const file = await fileHandle.getFile();
                        const arrayBuffer = await file.arrayBuffer();
                        const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);
                        audioBuffers[inst].push(decodedBuffer);
                    } catch (e) {
                        console.warn(`Could not load ${filename}:`, e);
                    }
                }
                
                if (audioBuffers[inst].length === 0 && DEFAULT_INSTRUMENTS.includes(inst)) {
                    await loadSample(inst);
                }
            }
            
            for (const seqId in sequencersData) {
                const data = sequencersData[seqId];
                INSTRUMENTS.forEach(inst => {
                    if (!data.grid[inst]) data.grid[inst] = Array(64).fill(false);
                    if (!data.velocities[inst]) data.velocities[inst] = Array(64).fill(100);
                });
            }
            
            createGlobalMixerPanel();
            updateAllSequencerGrids();
            renderSongStructureVisual();
            
            alert("Sample set imported successfully!");
        } catch (err) {
            console.error(err);
            alert("Failed to import sample set: " + err.message);
        }
    }
    
    function promptForFile(callback) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = (event) => {
            if (!event.target.files.length) return;
            const file = event.target.files[0];
            const reader = new FileReader();
            reader.onload = (readEvent) => callback(readEvent.target.result);
            reader.onerror = () => alert('Error reading file.');
            reader.readAsText(file);
            input.value = '';
        };
        input.click();
    }

    function handleExportSong() {
        const structure = songStructureInput.value;
        const requiredNames = new Set(structure.replace(/[^A-Z]/g, ''));
        const patterns = {};

        requiredNames.forEach(name => {
            const seq = Object.values(sequencersData).find(s => s.name === name);
            if (seq) {
                const patternObject = {};
                INSTRUMENTS.forEach(instrument => {
                    const stepData = seq.grid[instrument].slice(0, seq.steps);
                    if (stepData.some(isActive => isActive)) {
                       patternObject[instrument] = stepData.map(isActive => isActive ? 1 : 0);
                    }
                });
                patterns[name] = {
                    steps: seq.steps,
                    timeSignature: seq.timeSignature,
                    tuplet: seq.tuplet || 'none',
                    pattern: patternObject
                };
            }
        });

        const exportData = { bpm: parseInt(tempoInput.value, 10), structure, patterns };
        const replacer = (key, value) => (Array.isArray(value) && INSTRUMENTS.includes(key)) ? `@@${JSON.stringify(value)}@@` : value;
        let jsonString = JSON.stringify(exportData, replacer, 2).replace(/"@@(.*?)@@"/g, '$1');
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'drum-song.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    function handleImportSong() {
        promptForFile(fileContent => {
            try {
                const songData = JSON.parse(fileContent);
                if (typeof songData.bpm !== 'number' || songData.bpm < 20 || songData.bpm > 300) throw new Error("Invalid BPM.");
                if (typeof songData.structure !== 'string') throw new Error("Invalid song structure.");
                if (typeof songData.patterns !== 'object' || songData.patterns === null) throw new Error("Missing patterns.");
                
                stop();
                clearAllSequencers();
                
                bpm = songData.bpm;
                tempoInput.value = bpm;
                songStructureInput.value = songData.structure;

                for (const name in songData.patterns) {
                    createSequencer(name, name);
                    validateAndApplyRhythm(name, { [name]: songData.patterns[name] });
                }
                renderSongStructureVisual();
                alert("Song imported successfully!");
            } catch (error) {
                alert(`Import Failed: ${error.message}`);
            }
        });
    }
    
    function handleSaveSession() {
        const sessionData = {
            version: 1,
            bpm,
            songStructure: songStructureInput.value,
            globalMixerSettings,
            isHumanizeOn,
            timingHumanizeAmount,
            velocityHumanizeAmount,
            swingAmount,
            isCountInEnabled,
            randomFillsEnabled,
            skinName: skinSelect.value,
            sequencersData,
            instrumentNames,
            INSTRUMENTS
        };
        const jsonString = JSON.stringify(sessionData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `drum-session.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
    
    function handleLoadSession() {
        promptForFile(fileContent => {
             try {
                const sessionData = JSON.parse(fileContent);
                if (sessionData.version !== 1) throw new Error("Incompatible version.");
                if (typeof sessionData.bpm !== 'number' || sessionData.bpm < 20 || sessionData.bpm > 300) throw new Error("Invalid BPM.");
                if (typeof sessionData.isHumanizeOn !== 'boolean') throw new Error("Invalid Humanizer options.");
                if (typeof sessionData.sequencersData !== 'object') throw new Error("Sequencer data missing.");

                stop();
                clearAllSequencers();

                bpm = sessionData.bpm;
                tempoInput.value = bpm;
                songStructureInput.value = sessionData.songStructure;
                
                isHumanizeOn = sessionData.isHumanizeOn;
                timingHumanizeAmount = sessionData.timingHumanizeAmount;
                velocityHumanizeAmount = sessionData.velocityHumanizeAmount;
                swingAmount = sessionData.swingAmount;
                
                humanizeBtn.classList.toggle('toggled-on', isHumanizeOn);
                humanizeBtn.textContent = isHumanizeOn ? "Humanize ON" : "Humanize OFF";
                timingHumanizeSlider.value = timingHumanizeAmount;
                timingHumanizeSlider.dispatchEvent(new Event('input'));
                velocityHumanizeSlider.value = velocityHumanizeAmount;
                velocityHumanizeSlider.dispatchEvent(new Event('input'));
                swingSlider.value = swingAmount;
                swingSlider.dispatchEvent(new Event('input'));

                isCountInEnabled = sessionData.isCountInEnabled;
                countInBtn.classList.toggle('toggled-on', isCountInEnabled);
                countInBtn.textContent = isCountInEnabled ? "Count In ON" : "Count In OFF";

                randomFillsEnabled = sessionData.randomFillsEnabled;
                randomFillsBtn.classList.toggle('toggled-on', randomFillsEnabled);
                randomFillsBtn.textContent = randomFillsEnabled ? "Fills ON" : "Fills OFF";

                globalMixerSettings = sessionData.globalMixerSettings;
                Object.assign(instrumentNames, sessionData.instrumentNames || {});
                INSTRUMENTS = sessionData.INSTRUMENTS || [...DEFAULT_INSTRUMENTS];

                createGlobalMixerPanel();

                sequencersData = sessionData.sequencersData;
                for (const id in sequencersData) {
                    const seqData = sequencersData[id];
                    createSequencer(id, seqData.name);
                    sequencersData[id] = seqData;
                    updateSequencerGrid(id, seqData.steps);
                }

                if (sessionData.skinName && skinsData[sessionData.skinName]) {
                    skinSelect.value = sessionData.skinName;
                    applySkin(skinsData[sessionData.skinName]);
                }

                renderSongStructureVisual();
                alert("Session loaded successfully!");
             } catch(error) {
                alert(`Load failed: ${error.message}`);
             }
        });
    }

    // --- INITIALIZATION ---
    loadSkins();
    loadRhythmPatterns();

    tempoInput.addEventListener('change', (e) => {
        bpm = parseInt(e.target.value, 10);
        renderSongStructureVisual();
    });
    tapTempoBtn.addEventListener('click', tapTempo);
    humanizeBtn.addEventListener('click', () => { 
        isHumanizeOn = !isHumanizeOn; 
        humanizeBtn.textContent = isHumanizeOn ? "Humanize ON" : "Humanize OFF"; 
        humanizeBtn.classList.toggle('toggled-on', isHumanizeOn); 
    });
    timingHumanizeSlider.addEventListener('input', (e) => {
        timingHumanizeAmount = parseFloat(e.target.value);
        e.target.previousElementSibling.querySelector('output').value = Math.round(timingHumanizeAmount * 100);
    });
    velocityHumanizeSlider.addEventListener('input', (e) => {
        velocityHumanizeAmount = parseFloat(e.target.value);
        e.target.previousElementSibling.querySelector('output').value = Math.round(velocityHumanizeAmount * 100);
    });
    swingSlider.addEventListener('input', (e) => {
        swingAmount = parseFloat(e.target.value);
        e.target.previousElementSibling.querySelector('output').value = Math.round((0.5 + swingAmount) * 100);
    });
    insertSequencersBtn.addEventListener('click', handleInsertSequencers);
    songPlayBtn.addEventListener('click', playSong);
    songStructureInput.addEventListener('input', (e) => {
        const sanitizedValue = e.target.value.toUpperCase().replace(/[^A-Z0-9<>+*']/g, '');
        if (e.target.value !== sanitizedValue) e.target.value = sanitizedValue;
        renderSongStructureVisual();
    });
    randomFillsBtn.addEventListener('click', () => {
        randomFillsEnabled = !randomFillsEnabled;
        randomFillsBtn.textContent = randomFillsEnabled ? "Fills ON" : "Fills OFF";
        randomFillsBtn.classList.toggle('toggled-on', randomFillsEnabled);
        renderSongStructureVisual();
    });
    countInBtn.addEventListener('click', () => {
        isCountInEnabled = !isCountInEnabled;
        countInBtn.textContent = isCountInEnabled ? "Count In ON" : "Count In OFF";
        countInBtn.classList.toggle('toggled-on', isCountInEnabled);
    });
    
    document.getElementById('export-song-midi-btn').addEventListener('click', () => {
        SongDrumMachineExporter.exportMidi({
            songStructure: songStructureInput.value,
            sequencersData: sequencersData,
            bpm: bpm,
            INSTRUMENTS: INSTRUMENTS,
            INSTRUMENT_MIDI_NOTES: INSTRUMENT_MIDI_NOTES,
            FILL_INSTRUMENTS: FILL_INSTRUMENTS,
            randomFillsEnabled: randomFillsEnabled,
            swingAmount: swingAmount
        });
    });

    document.getElementById('export-song-wav-btn').addEventListener('click', async () => {
        await initAudio();
        
        const masteringSettings = masteringProcessor ? {
            states: { ...masteringProcessor.states },
            satDrive: parseInt(document.getElementById('sat-drive').value, 10),
            satMix: parseInt(document.getElementById('sat-mix').value, 10) / 100,
            compThresh: parseFloat(document.getElementById('comp-thresh').value),
            compRatio: parseFloat(document.getElementById('comp-ratio').value),
            filterHpf: parseFloat(document.getElementById('filter-hpf').value),
            filterLpf: parseFloat(document.getElementById('filter-lpf').value),
            delayTime: parseInt(document.getElementById('delay-time').value, 10) / 1000,
            delayFeedback: parseInt(document.getElementById('delay-feedback').value, 10) / 100,
            reverbDecay: parseInt(document.getElementById('reverb-decay').value, 10) / 10,
            reverbMix: parseInt(document.getElementById('reverb-mix').value, 10) / 100,
            limiterCeil: parseFloat(document.getElementById('limiter-ceil').value)
        } : null;

        SongDrumMachineExporter.exportWav({
            songStructure: songStructureInput.value,
            sequencersData: sequencersData,
            bpm: bpm,
            globalMixerSettings: globalMixerSettings,
            audioBuffers: audioBuffers,
            INSTRUMENTS: INSTRUMENTS,
            FILL_INSTRUMENTS: FILL_INSTRUMENTS,
            randomFillsEnabled: randomFillsEnabled,
            isHumanizeOn: isHumanizeOn,
            timingHumanizeAmount: timingHumanizeAmount,
            velocityHumanizeAmount: velocityHumanizeAmount,
            swingAmount: swingAmount,
            masteringSettings: masteringSettings
        });
    });

    scanMidiBtn.addEventListener('click', initMidi);
    midiInSelect.onchange = selectMidiInput;
    midiOutSelect.onchange = (e) => {
        const deviceId = e.target.value;
        currentMidiOutput = deviceId ? midiAccess.outputs.get(deviceId) : null;
    };
    exampleSongSelect.addEventListener('change', handleLoadExampleSong);
    
    // Panel Toggles
    toggleMixerBtn.addEventListener('click', () => {
        const panel = document.getElementById('global-mix-panel');
        panel.classList.toggle('hidden');
        toggleMixerBtn.textContent = panel.classList.contains('hidden') ? 'Show Volume, Pan & Sample' : 'Hide Volume, Pan & Sample';
    });
    toggleVisualizerBtn.addEventListener('click', () => {
        const panel = document.getElementById('drum-kit-visualizer-container');
        panel.classList.toggle('hidden');
        toggleVisualizerBtn.textContent = panel.classList.contains('hidden') ? 'Show Live Monitor' : 'Hide Live Monitor';
    });
    toggleMasteringBtn.addEventListener('click', () => {
        const panel = document.getElementById('mastering-panel');
        panel.classList.toggle('hidden');
        toggleMasteringBtn.textContent = panel.classList.contains('hidden') ? 'Show Mastering Processor' : 'Hide Mastering Processor';
    });
    infoBtn.addEventListener('click', () => {
        if (window.DrumMachineInfo) window.DrumMachineInfo.show();
    });

    // Performance Inputs
    document.addEventListener('keydown', async (e) => {
        if (e.target.matches('input[type="text"], input[type="number"]')) return;
        if (e.repeat) return;
        const instrument = KEY_MAP[e.key.toLowerCase()];
        if (instrument) {
            e.preventDefault();
            await initAudio();
            const settings = globalMixerSettings[instrument];
            playSample(instrument, settings.volume, settings.panning, 127, audioContext.currentTime, -1);
            liveRecordNote(instrument);
        }
    });

    document.querySelectorAll('#drum-kit-visualizer .kit-piece').forEach(el => {
        el.addEventListener('click', async (e) => {
            const visualId = e.target.dataset.visualId;
            const instrument = VISUAL_TO_INSTRUMENT_MAP[visualId];
            if (instrument) {
                await initAudio();
                const settings = globalMixerSettings[instrument];
                playSample(instrument, settings.volume, settings.panning, 127, audioContext.currentTime, -1);
                liveRecordNote(instrument);
            }
        });
    });

    skinSelect.addEventListener('change', handleSkinChange);
    randomSongBtn.addEventListener('click', generateRandomSong);
    exportSongBtn.addEventListener('click', handleExportSong);
    importSongBtn.addEventListener('click', handleImportSong);
    saveSessionBtn.addEventListener('click', handleSaveSession);
    loadSessionBtn.addEventListener('click', handleLoadSession);

    createGlobalMixerPanel();
    createSequencer('A', 'A');
    loadExampleSongs();
    renderSongStructureVisual();
});
