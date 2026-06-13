(function() {
    function toVLQ(num) {
        let bytes = [];
        let b = num & 0x7F;
        bytes.push(b);
        while (num > 0x7F) {
            num >>>= 7;
            b = (num & 0x7F) | 0x80;
            bytes.push(b);
        }
        return bytes.reverse();
    }

    // Helper functions to parse layout string structures consistently
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

    function compileSongBlocks(tokens, baseBpm, randomFillsEnabled) {
        const blocks = [];
        let currentBpm = baseBpm;
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

    function encodeMidi(songStructure, sequencersData, bpm, INSTRUMENTS, INSTRUMENT_MIDI_NOTES, FILL_INSTRUMENTS, randomFillsEnabled, swingAmount) {
        let currentTick = 0;
        let events = [];

        const tempoVal = Math.round(60000000 / bpm);
        events.push({
            tick: 0,
            type: 'meta',
            bytes: [0xFF, 0x51, 0x03, (tempoVal >> 16) & 0xFF, (tempoVal >> 8) & 0xFF, tempoVal & 0xFF]
        });

        const tokens = parseSongStructure(songStructure.join(''));
        const songBlocks = compileSongBlocks(tokens, bpm, randomFillsEnabled);

        songBlocks.forEach((block) => {
            if (block.type === 'intro') {
                for (let step = 0; step < 16; step++) {
                    if (step === 0 || step === 4 || step === 8 || step === 12) {
                        const note = INSTRUMENT_MIDI_NOTES['hi-hat-open'];
                        if (note) {
                            events.push({ tick: currentTick + step * 24, type: 'noteOn', note, velocity: 100 });
                            events.push({ tick: currentTick + step * 24 + 20, type: 'noteOff', note, velocity: 0 });
                        }
                    }
                }
                currentTick += 16 * 24;
            } else if (block.type === 'outro') {
                const stepTick = currentTick;
                const noteKick = INSTRUMENT_MIDI_NOTES['kick'];
                const noteCrash = INSTRUMENT_MIDI_NOTES['crash1'];
                if (noteKick) {
                    events.push({ tick: stepTick, type: 'noteOn', note: noteKick, velocity: 110 });
                    events.push({ tick: stepTick + 20, type: 'noteOff', note: noteKick, velocity: 0 });
                }
                if (noteCrash) {
                    events.push({ tick: stepTick, type: 'noteOn', note: noteCrash, velocity: 120 });
                    events.push({ tick: stepTick + 20, type: 'noteOff', note: noteCrash, velocity: 0 });
                }
                currentTick += 16 * 24;
            } else if (block.type === 'fill') {
                for (let step = 0; step < block.steps; step++) {
                    const stepTick = currentTick + step * 24;
                    FILL_INSTRUMENTS.forEach(inst => {
                        const rand = (Math.sin(stepTick) + 1) / 2;
                        if (rand > 0.6) {
                            const note = INSTRUMENT_MIDI_NOTES[inst];
                            if (note) {
                                events.push({ tick: stepTick, type: 'noteOn', note: note, velocity: 100 });
                                events.push({ tick: stepTick + 20, type: 'noteOff', note: note, velocity: 0 });
                            }
                        }
                    });
                }
                currentTick += block.steps * 24;
            } else if (block.type === 'pattern') {
                const seq = Object.values(sequencersData).find(s => s.name === block.name);
                if (seq) {
                    const numSteps = block.steps;
                    for (let step = 0; step < numSteps; step++) {
                        let stepTick = currentTick + step * 24;
                        if (swingAmount > 0 && step % 2 !== 0) {
                            stepTick += Math.round(swingAmount * 2 * 24);
                        }

                        let suppressCymbals = false;
                        if (step === 0 && block.crashAccent) {
                            suppressCymbals = true;
                            const noteCrash = INSTRUMENT_MIDI_NOTES['crash1'];
                            if (noteCrash) {
                                events.push({ tick: stepTick, type: 'noteOn', note: noteCrash, velocity: 127 });
                                events.push({ tick: stepTick + 20, type: 'noteOff', note: noteCrash, velocity: 0 });
                            }
                        }

                        INSTRUMENTS.forEach(inst => {
                            if (seq.grid[inst] && seq.grid[inst][step]) {
                                if (suppressCymbals && ['crash1', 'crash2', 'ride', 'china', 'hi-hat-open', 'hi-hat-closed'].includes(inst)) {
                                    return;
                                }
                                const note = INSTRUMENT_MIDI_NOTES[inst];
                                if (note) {
                                    const velocity = seq.velocities[inst] ? seq.velocities[inst][step] : 100;
                                    events.push({ tick: stepTick, type: 'noteOn', note: note, velocity: velocity });
                                    events.push({ tick: stepTick + 20, type: 'noteOff', note: note, velocity: 0 });
                                }
                            }
                        });
                    }
                    currentTick += numSteps * 24;
                }
            }
        });

        events.sort((a, b) => {
            if (a.tick !== b.tick) return a.tick - b.tick;
            if (a.type === 'noteOff' && b.type === 'noteOn') return -1;
            if (a.type === 'noteOn' && b.type === 'noteOff') return 1;
            return 0;
        });

        let trackData = [];
        let lastTick = 0;

        events.forEach(evt => {
            const delta = evt.tick - lastTick;
            lastTick = evt.tick;
            trackData = trackData.concat(toVLQ(delta));
            if (evt.type === 'noteOn') {
                trackData.push(0x99, evt.note, evt.velocity);
            } else if (evt.type === 'noteOff') {
                trackData.push(0x89, evt.note, 0);
            } else if (evt.type === 'meta') {
                trackData = trackData.concat(evt.bytes);
            }
        });

        trackData = trackData.concat([0x00, 0xFF, 0x2F, 0x00]);

        const fileHeader = [
            0x4D, 0x54, 0x68, 0x64,
            0x00, 0x00, 0x00, 0x06,
            0x00, 0x00,
            0x00, 0x01,
            0x00, 0x60
        ];

        const trackHeader = [
            0x4D, 0x54, 0x72, 0x6B,
            (trackData.length >> 24) & 0xFF,
            (trackData.length >> 16) & 0xFF,
            (trackData.length >> 8) & 0xFF,
            trackData.length & 0xFF
        ];

        return new Uint8Array(fileHeader.concat(trackHeader, trackData));
    }

    function scheduleOfflineNote(ctx, destNode, instrument, buffer, volume, panning, velocity, time, step, bpm, isHumanizeOn, timingHumanizeAmount, velocityHumanizeAmount, swingAmount) {
        const source = ctx.createBufferSource();
        source.buffer = buffer;

        const pannerNode = ctx.createStereoPanner();
        pannerNode.pan.setValueAtTime(panning, time);

        const gainNode = ctx.createGain();
        let finalVolume = volume * (velocity / 127);

        if (isHumanizeOn && velocityHumanizeAmount > 0) {
            const velocityVariation = ((Math.random() - 0.5) * 2 * 0.2 * velocityHumanizeAmount);
            finalVolume = Math.max(0, finalVolume + velocityVariation);
        }
        gainNode.gain.setValueAtTime(Math.min(1.0, finalVolume), time);

        source.connect(pannerNode).connect(gainNode).connect(destNode);

        let timeOffset = 0;
        const sixteenthNoteTime = (60.0 / bpm) / 4.0;
        
        if (swingAmount > 0 && step % 2 !== 0) {
            const delay = swingAmount * 2 * sixteenthNoteTime;
            timeOffset += delay;
        }
        
        if (isHumanizeOn && timingHumanizeAmount > 0) {
            const timingVariation = (Math.random() - 0.5) * (sixteenthNoteTime * 0.5) * timingHumanizeAmount;
            timeOffset += timingVariation;
        }

        source.start(time + timeOffset);
    }

    function bufferToWav(buffer) {
        const numOfChan = buffer.numberOfChannels,
              dataLength = buffer.length * numOfChan * 2,
              length = dataLength + 44,
              bufferArr = new ArrayBuffer(length),
              view = new DataView(bufferArr),
              channels = [], 
              sampleRate = buffer.sampleRate;
              
        let i, sample,
            offset = 0,
            pos = 0;

        function setUint16(data) {
            view.setUint16(pos, data, true);
            pos += 2;
        }

        function setUint32(data) {
            view.setUint32(pos, data, true);
            pos += 4;
        }

        setUint32(0x46464952); // "RIFF"
        setUint32(length - 8);
        setUint32(0x45564157); // "WAVE"

        setUint32(0x20746d66); // "fmt "
        setUint32(16);
        setUint16(1);
        setUint16(numOfChan);
        setUint32(sampleRate);
        setUint32(sampleRate * numOfChan * 2);
        setUint16(numOfChan * 2);
        setUint16(16);

        setUint32(0x61746164); // "data"
        setUint32(dataLength);

        for(i = 0; i < numOfChan; i++) {
            channels.push(buffer.getChannelData(i));
        }

        while(pos < length) {
            for(i = 0; i < numOfChan; i++) {
                sample = Math.max(-1, Math.min(1, channels[i][offset]));
                sample = (sample < 0 ? sample * 0x8000 : sample * 0x7FFF);
                view.setInt16(pos, sample, true);
                pos += 2;
            }
            offset++;
        }

        return bufferArr;
    }

    window.SongDrumMachineExporter = {
        exportMidi: function(options) {
            try {
                const rawStruct = options.songStructure.toUpperCase().replace(/[^A-Z0-9<>+*']/g, '');
                if (!rawStruct.length) {
                    alert("Please enter a valid song structure before exporting.");
                    return;
                }
                const midiBytes = encodeMidi(
                    [rawStruct],
                    options.sequencersData,
                    options.bpm,
                    options.INSTRUMENTS,
                    options.INSTRUMENT_MIDI_NOTES,
                    options.FILL_INSTRUMENTS,
                    options.randomFillsEnabled,
                    options.swingAmount
                );
                const blob = new Blob([midiBytes], { type: 'audio/midi' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'drum-song.mid';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch (err) {
                console.error("MIDI Export Failed:", err);
                alert("MIDI Export Failed: " + err.message);
            }
        },

        exportWav: async function(options) {
            try {
                const rawStruct = options.songStructure.toUpperCase().replace(/[^A-Z0-9<>+*']/g, '');
                if (!rawStruct.length) {
                    alert("Please enter a valid song structure before exporting.");
                    return;
                }

                const tokens = parseSongStructure(rawStruct);
                const songBlocks = compileSongBlocks(tokens, options.bpm, options.randomFillsEnabled);

                let totalDuration = 0.0;
                let currentStepTime = 0.0;
                let previousBpm = options.bpm;

                // 1. Calculate duration based on dynamic tempos & glides
                songBlocks.forEach((block) => {
                    const targetBpm = block.bpm;
                    const steps = block.steps;
                    const transitionSteps = block.transitionSteps;

                    for (let step = 0; step < steps; step++) {
                        let stepBpm = targetBpm;
                        if (transitionSteps && step < transitionSteps) {
                            stepBpm = previousBpm + (targetBpm - previousBpm) * (step / transitionSteps);
                        }
                        const stepDur = (60.0 / stepBpm) / 4.0;
                        totalDuration += stepDur;
                    }
                    previousBpm = targetBpm;
                });

                totalDuration += 2.0; // Decay margin

                const offlineCtx = new OfflineAudioContext(2, Math.ceil(totalDuration * 44100), 44100);

                // Re-create the master processor inside the OfflineContext to copy processing settings to exported audio
                let offlineMaster = null;
                if (window.MasteringProcessor && options.masteringSettings) {
                    offlineMaster = new window.MasteringProcessor(offlineCtx);
                    
                    // Mirror UI states
                    offlineMaster.states = { ...options.masteringSettings.states };
                    offlineMaster.satMixValue = options.masteringSettings.satMix;
                    offlineMaster.reverbMixValue = options.masteringSettings.reverbMix;
                    
                    // Mirror node values
                    offlineMaster.satNode.curve = offlineMaster.makeDistortionCurve(options.masteringSettings.satDrive);
                    offlineMaster.compNode.threshold.setValueAtTime(options.masteringSettings.compThresh, 0);
                    offlineMaster.compNode.ratio.setValueAtTime(options.masteringSettings.compRatio, 0);
                    offlineMaster.delayNode.delayTime.setValueAtTime(options.masteringSettings.delayTime, 0);
                    offlineMaster.delayFeedback.gain.setValueAtTime(options.masteringSettings.delayFeedback, 0);
                    offlineMaster.setReverbDecay(options.masteringSettings.reverbDecay);
                    offlineMaster.limiterNode.threshold.setValueAtTime(options.masteringSettings.limiterCeil, 0);
                    
                    offlineMaster.updateBypassGains();
                    offlineMaster.output.connect(offlineCtx.destination);
                }

                const destNode = offlineMaster ? offlineMaster.input : offlineCtx.destination;
                previousBpm = options.bpm;

                // 2. Schedule notes with tempo transitions
                songBlocks.forEach((block) => {
                    const targetBpm = block.bpm;
                    const steps = block.steps;
                    const transitionSteps = block.transitionSteps;

                    let fillPattern = null;
                    if (block.type === 'fill') {
                        // Create a deterministic fill pattern for exporting
                        fillPattern = {};
                        options.INSTRUMENTS.forEach(inst => fillPattern[inst] = Array(steps).fill(false));
                        for (let s = 0; s < steps; s++) {
                            const stepTime = currentStepTime + s * 0.1;
                            if ((Math.sin(stepTime) + 1) / 2 > 0.4) {
                                const randomInst = options.FILL_INSTRUMENTS[Math.floor((Math.sin(stepTime * 3) + 1) / 2 * options.FILL_INSTRUMENTS.length)];
                                fillPattern[randomInst][s] = true;
                            }
                        }
                    }

                    for (let step = 0; step < steps; step++) {
                        let stepBpm = targetBpm;
                        if (transitionSteps && step < transitionSteps) {
                            stepBpm = previousBpm + (targetBpm - previousBpm) * (step / transitionSteps);
                        }
                        const timePerStep = (60.0 / stepBpm) / 4.0;
                        const scheduledTime = currentStepTime;

                        if (block.type === 'intro') {
                            if (step === 0 || step === 4 || step === 8 || step === 12) {
                                const settings = options.globalMixerSettings['hi-hat-open'];
                                if (settings && options.audioBuffers['hi-hat-open']) {
                                    scheduleOfflineNote(offlineCtx, destNode, 'hi-hat-open', options.audioBuffers['hi-hat-open'], settings.volume, settings.panning, 100, scheduledTime, step, stepBpm, options.isHumanizeOn, options.timingHumanizeAmount, options.velocityHumanizeAmount, options.swingAmount);
                                }
                            }
                        } else if (block.type === 'outro') {
                            if (step === 0) {
                                const kickSet = options.globalMixerSettings['kick'];
                                const crashSet = options.globalMixerSettings['crash1'];
                                if (kickSet && options.audioBuffers['kick']) {
                                    scheduleOfflineNote(offlineCtx, destNode, 'kick', options.audioBuffers['kick'], kickSet.volume, kickSet.panning, 110, scheduledTime, step, stepBpm, options.isHumanizeOn, options.timingHumanizeAmount, options.velocityHumanizeAmount, options.swingAmount);
                                }
                                if (crashSet && options.audioBuffers['crash1']) {
                                    scheduleOfflineNote(offlineCtx, destNode, 'crash1', options.audioBuffers['crash1'], crashSet.volume, crashSet.panning, 120, scheduledTime, step, stepBpm, options.isHumanizeOn, options.timingHumanizeAmount, options.velocityHumanizeAmount, options.swingAmount);
                                }
                            }
                        } else {
                            let gridToUse = null;
                            if (block.type === 'fill') {
                                gridToUse = fillPattern;
                            } else if (block.type === 'pattern') {
                                const seq = Object.values(options.sequencersData).find(s => s.name === block.name);
                                if (seq) gridToUse = seq.grid;
                            }

                            if (gridToUse) {
                                let suppressCymbals = false;
                                if (step === 0 && block.crashAccent) {
                                    suppressCymbals = true;
                                    const crashSet = options.globalMixerSettings['crash1'];
                                    if (crashSet && options.audioBuffers['crash1']) {
                                        scheduleOfflineNote(offlineCtx, destNode, 'crash1', options.audioBuffers['crash1'], crashSet.volume, crashSet.panning, 127, scheduledTime, step, stepBpm, options.isHumanizeOn, options.timingHumanizeAmount, options.velocityHumanizeAmount, options.swingAmount);
                                    }
                                }

                                options.INSTRUMENTS.forEach(inst => {
                                    if (gridToUse[inst] && gridToUse[inst][step]) {
                                        if (suppressCymbals && ['crash1', 'crash2', 'ride', 'china', 'hi-hat-open', 'hi-hat-closed'].includes(inst)) {
                                            return;
                                        }
                                        const settings = options.globalMixerSettings[inst];
                                        const seq = Object.values(options.sequencersData).find(s => s.name === block.name);
                                        const velocity = (seq && seq.velocities[inst]) ? seq.velocities[inst][step] : 100;
                                        if (settings && options.audioBuffers[inst]) {
                                            scheduleOfflineNote(offlineCtx, destNode, inst, options.audioBuffers[inst], settings.volume, settings.panning, velocity, scheduledTime, step, stepBpm, options.isHumanizeOn, options.timingHumanizeAmount, options.velocityHumanizeAmount, options.swingAmount);
                                        }
                                    }
                                });
                            }
                        }
                        currentStepTime += timePerStep;
                    }
                    previousBpm = targetBpm;
                });

                const renderedBuffer = await offlineCtx.startRendering();
                const wavBytes = bufferToWav(renderedBuffer);
                const blob = new Blob([wavBytes], { type: 'audio/wav' });

                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'drum-song.wav';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch (err) {
                console.error("WAV Export Failed:", err);
                alert("WAV Export Failed: " + err.message);
            }
        }
    };
})();
