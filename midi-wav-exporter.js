(function() {
    // Utility to compile Variable Length Quantity bytes for MIDI delta-times
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

    // Encodes a standard multi-pattern arrangement into SMF MIDI bytes
    function encodeMidi(songStructure, sequencersData, bpm, INSTRUMENTS, INSTRUMENT_MIDI_NOTES, FILL_INSTRUMENTS, randomFillsEnabled, swingAmount) {
        let currentTick = 0;
        let events = [];

        // Set tempo meta event (microsec per quarter note)
        const tempoVal = Math.round(60000000 / bpm);
        events.push({
            tick: 0,
            type: 'meta',
            bytes: [0xFF, 0x51, 0x03, (tempoVal >> 16) & 0xFF, (tempoVal >> 8) & 0xFF, tempoVal & 0xFF]
        });

        songStructure.forEach((identifier, index) => {
            let useFill = false;
            let fillSteps = 0;
            let seq = null;

            if (randomFillsEnabled && /^[1-9]$/.test(identifier)) {
                useFill = true;
                fillSteps = parseInt(identifier, 10);
            } else {
                seq = Object.values(sequencersData).find(s => s.name === identifier);
            }

            if (useFill) {
                // Generate a deterministic fill pattern for exporting
                for (let step = 0; step < fillSteps; step++) {
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
                currentTick += fillSteps * 24;
            } else if (seq) {
                let numSteps = seq.steps;
                if (randomFillsEnabled && index + 1 < songStructure.length) {
                    const nextIdentifier = songStructure[index + 1];
                    if (/^[1-9]$/.test(nextIdentifier)) {
                        const fillLength = parseInt(nextIdentifier, 10);
                        if (fillLength <= numSteps) {
                            numSteps -= fillLength;
                        }
                    }
                }

                for (let step = 0; step < numSteps; step++) {
                    let stepTick = currentTick + step * 24;
                    
                    // Apply Swing delay to alternating steps
                    if (swingAmount > 0 && step % 2 !== 0) {
                        const delayTicks = Math.round(swingAmount * 2 * 24);
                        stepTick += delayTicks;
                    }

                    INSTRUMENTS.forEach(inst => {
                        if (seq.grid[inst] && seq.grid[inst][step]) {
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
        });

        // Sort events chronologically
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
                trackData.push(0x99, evt.note, evt.velocity); // Channel 10 Note On
            } else if (evt.type === 'noteOff') {
                trackData.push(0x89, evt.note, 0); // Channel 10 Note Off
            } else if (evt.type === 'meta') {
                trackData = trackData.concat(evt.bytes);
            }
        });

        // End of track meta event
        trackData = trackData.concat([0x00, 0xFF, 0x2F, 0x00]);

        const fileHeader = [
            0x4D, 0x54, 0x68, 0x64, // "MThd"
            0x00, 0x00, 0x00, 0x06,
            0x00, 0x00,             // Single track format
            0x00, 0x01,             // 1 track
            0x00, 0x60              // 96 PPQ (Ticks per quarter note)
        ];

        const trackHeader = [
            0x4D, 0x54, 0x72, 0x6B, // "MTrk"
            (trackData.length >> 24) & 0xFF,
            (trackData.length >> 16) & 0xFF,
            (trackData.length >> 8) & 0xFF,
            trackData.length & 0xFF
        ];

        return new Uint8Array(fileHeader.concat(trackHeader, trackData));
    }

    // Schedules a sample source buffer at an exact point inside the OfflineAudioContext
    function scheduleOfflineNote(ctx, instrument, buffer, volume, panning, velocity, time, step, bpm, isHumanizeOn, timingHumanizeAmount, velocityHumanizeAmount, swingAmount) {
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

        source.connect(pannerNode).connect(gainNode).connect(ctx.destination);

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

    // Standard WAV array buffer formatting
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
        setUint32(length - 8); // Tiedostokoko miinus 8 tavua
        setUint32(0x45564157); // "WAVE"

        setUint32(0x20746d66); // "fmt "
        setUint32(16);         // Subchunk1Size (16 PCM-formaatille)
        setUint16(1);          // AudioFormat (1 = pakkaamaton PCM)
        setUint16(numOfChan);
        setUint32(sampleRate);
        setUint32(sampleRate * numOfChan * 2); // ByteRate
        setUint16(numOfChan * 2);              // BlockAlign
        setUint16(16);                         // BitsPerSample (16-bit)

        setUint32(0x61746164); // "data"
        setUint32(dataLength); // Äänidatan pituus tavuina

        for(i = 0; i < numOfChan; i++) {
            channels.push(buffer.getChannelData(i));
        }

        // Kirjoitetaan äänidata suoraan pos-indeksin osoittamaan kohtaan
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

    // Expose functionality directly to window namespace without requiring a server
    window.SongDrumMachineExporter = {
        exportMidi: function(options) {
            try {
                const songStructure = [...options.songStructure.toUpperCase().replace(/[^A-Z0-9]/g, '')];
                if (!songStructure.length) {
                    alert("Please enter a valid song structure before exporting.");
                    return;
                }
                const midiBytes = encodeMidi(
                    songStructure,
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
                const songStructure = [...options.songStructure.toUpperCase().replace(/[^A-Z0-9]/g, '')];
                if (!songStructure.length) {
                    alert("Please enter a valid song structure before exporting.");
                    return;
                }

                // 1. Calculate length and duration dynamically
                let totalSteps = 0;
                const timePerStep = (60.0 / options.bpm) / 4.0;

                songStructure.forEach((identifier, index) => {
                    if (options.randomFillsEnabled && /^[1-9]$/.test(identifier)) {
                        totalSteps += parseInt(identifier, 10);
                    } else {
                        const seq = Object.values(options.sequencersData).find(s => s.name === identifier);
                        if (seq) {
                            let steps = seq.steps;
                            if (options.randomFillsEnabled && index + 1 < songStructure.length) {
                                const nextIdentifier = songStructure[index + 1];
                                if (/^[1-9]$/.test(nextIdentifier)) {
                                    const fillLength = parseInt(nextIdentifier, 10);
                                    if (fillLength <= steps) {
                                        steps -= fillLength;
                                    }
                                }
                            }
                            totalSteps += steps;
                        }
                    }
                });

                const totalDuration = totalSteps * timePerStep + 1.5; // decays
                const offlineCtx = new OfflineAudioContext(2, Math.ceil(totalDuration * 44100), 44100);

                let currentStepTime = 0.0;

                songStructure.forEach((identifier, index) => {
                    let useFill = false;
                    let fillSteps = 0;
                    let seq = null;

                    if (options.randomFillsEnabled && /^[1-9]$/.test(identifier)) {
                        useFill = true;
                        fillSteps = parseInt(identifier, 10);
                    } else {
                        seq = Object.values(options.sequencersData).find(s => s.name === identifier);
                    }

                    if (useFill) {
                        for (let step = 0; step < fillSteps; step++) {
                            const scheduledTime = currentStepTime + step * timePerStep;
                            options.FILL_INSTRUMENTS.forEach(inst => {
                                const rand = (Math.sin(scheduledTime) + 1) / 2;
                                if (rand > 0.6) {
                                    const settings = options.globalMixerSettings[inst];
                                    if (settings && options.audioBuffers[inst]) {
                                        scheduleOfflineNote(offlineCtx, inst, options.audioBuffers[inst], settings.volume, settings.panning, 100, scheduledTime, step, options.bpm, options.isHumanizeOn, options.timingHumanizeAmount, options.velocityHumanizeAmount, options.swingAmount);
                                    }
                                }
                            });
                        }
                        currentStepTime += fillSteps * timePerStep;
                    } else if (seq) {
                        let numSteps = seq.steps;
                        if (options.randomFillsEnabled && index + 1 < songStructure.length) {
                            const nextIdentifier = songStructure[index + 1];
                            if (/^[1-9]$/.test(nextIdentifier)) {
                                const fillLength = parseInt(nextIdentifier, 10);
                                if (fillLength <= numSteps) {
                                    numSteps -= fillLength;
                                }
                            }
                        }

                        for (let step = 0; step < numSteps; step++) {
                            const scheduledTime = currentStepTime + step * timePerStep;
                            options.INSTRUMENTS.forEach(inst => {
                                if (seq.grid[inst] && seq.grid[inst][step]) {
                                    const velocity = seq.velocities[inst] ? seq.velocities[inst][step] : 100;
                                    const settings = options.globalMixerSettings[inst];
                                    if (settings && options.audioBuffers[inst]) {
                                        scheduleOfflineNote(offlineCtx, inst, options.audioBuffers[inst], settings.volume, settings.panning, velocity, scheduledTime, step, options.bpm, options.isHumanizeOn, options.timingHumanizeAmount, options.velocityHumanizeAmount, options.swingAmount);
                                    }
                                }
                            });
                        }
                        currentStepTime += numSteps * timePerStep;
                    }
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
