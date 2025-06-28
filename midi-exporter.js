// midi-exporter.js

const SongDrumMachineExporter = (() => {

    /**
     * Exports the entire song structure to a downloadable MIDI file.
     * @param {object} config - The configuration object for the song.
     * @param {string} config.songStructure - The string defining the song sequence (e.g., "AB1A").
     * @param {object} config.sequencersData - The main object containing all sequencer patterns.
     * @param {number} config.bpm - The song's beats per minute.
     * @param {string[]} config.INSTRUMENTS - Array of instrument names.
     * @param {object} config.INSTRUMENT_MIDI_NOTES - Mapping of instrument names to MIDI note numbers.
     * @param {string[]} config.FILL_INSTRUMENTS - Array of instruments used for random fills.
     * @param {boolean} config.isHumanizeOn - Whether the random humanization is active.
     * @param {number} config.swingAmount - The swing factor (0 to 0.25).
     * @param {number} config.timingHumanizeAmount - The timing randomness factor (0 to 1).
     * @param {number} config.velocityHumanizeAmount - The velocity randomness factor (0 to 1).
     */
    function exportSong(config) {
        const {
            songStructure,
            sequencersData,
            bpm,
            INSTRUMENTS,
            INSTRUMENT_MIDI_NOTES,
            FILL_INSTRUMENTS,
            isHumanizeOn,
            swingAmount,
            timingHumanizeAmount,
            velocityHumanizeAmount
        } = config;

        if (!songStructure || Object.keys(sequencersData).length === 0) {
            alert("Please define a song structure and have at least one sequencer pattern.");
            return;
        }

        console.log("Starting MIDI export with humanization...");

        const track = new MidiWriter.Track();
        track.setTempo(bpm);
        // Ensure channel 10 is set to a percussion map (instrument 1 is arbitrary for channel 10)
        track.addEvent(new MidiWriter.ProgramChangeEvent({ instrument: 1, channel: 10 }));

        const ticksPerStep = MidiWriter.Writer.prototype.getTickDuration('16');
        let currentTick = 0;
        const structureArray = [...songStructure];

        structureArray.forEach((sectionIdentifier, index) => {
            let isFill = /^[1-9]$/.test(sectionIdentifier);
            let patternData;
            let grid;
            let numSteps;

            if (isFill) {
                numSteps = parseInt(sectionIdentifier, 10);
                const fillGrid = {};
                INSTRUMENTS.forEach(instrument => fillGrid[instrument] = Array(numSteps).fill(false));
                for (let i = 0; i < numSteps; i++) {
                    if (Math.random() > 0.4) {
                        const randomInstrument = FILL_INSTRUMENTS[Math.floor(Math.random() * FILL_INSTRUMENTS.length)];
                        fillGrid[randomInstrument][i] = true;
                    }
                }
                grid = fillGrid;
            } else {
                const sequencerEntry = Object.entries(sequencersData).find(([id, data]) => data.name === sectionIdentifier);
                if (!sequencerEntry) {
                    console.warn(`Pattern "${sectionIdentifier}" not found, skipping.`);
                    return;
                }
                patternData = sequencerEntry[1];
                grid = patternData.grid;
                numSteps = patternData.steps;

                if (index + 1 < structureArray.length) {
                    const nextIdentifier = structureArray[index + 1];
                    if (/^[1-9]$/.test(nextIdentifier)) {
                        const fillLength = parseInt(nextIdentifier, 10);
                        if (fillLength <= numSteps) {
                            numSteps -= fillLength;
                        }
                    }
                }
            }

            for (let step = 0; step < numSteps; step++) {
                const notesForThisStep = [];
                INSTRUMENTS.forEach(instrument => {
                    if (grid[instrument] && grid[instrument][step]) {
                        const midiNote = INSTRUMENT_MIDI_NOTES[instrument];
                        if (!midiNote) return;

                        let baseVelocity = 100;
                        if (patternData && patternData.velocities[instrument]) {
                            baseVelocity = Math.round((patternData.velocities[instrument][step] / 127) * 100);
                        }

                        // --- Apply Humanization & Swing ---
                        let finalVelocity = baseVelocity;
                        let tickOffset = 0;

                        if (isHumanizeOn) {
                            // Velocity Randomness
                            if (velocityHumanizeAmount > 0) {
                                const velocityVariation = Math.round(((Math.random() - 0.5) * 2) * 20 * velocityHumanizeAmount);
                                finalVelocity += velocityVariation;
                            }
                            // Timing Randomness
                            if (timingHumanizeAmount > 0) {
                                const timingVariation = Math.round(((Math.random() - 0.5) * 2) * (ticksPerStep * 0.25) * timingHumanizeAmount);
                                tickOffset += timingVariation;
                            }
                        }

                        // Swing (applied regardless of the humanize on/off button)
                        if (swingAmount > 0 && step % 2 !== 0) {
                            const swingDelay = Math.round(swingAmount * 2 * ticksPerStep);
                            tickOffset += swingDelay;
                        }

                        finalVelocity = Math.max(1, Math.min(100, finalVelocity));
                        const startTick = currentTick + (step * ticksPerStep) + tickOffset;

                        notesForThisStep.push(new MidiWriter.Note({
                            pitch: [midiNote],
                            duration: '16',
                            startTick: startTick,
                            velocity: finalVelocity,
                            channel: 10
                        }));
                    }
                });

                if (notesForThisStep.length > 0) {
                    track.addEvent(notesForThisStep);
                }
            }
            currentTick += numSteps * ticksPerStep;
        });

        const writer = new MidiWriter.Writer([track]);
        const dataUri = writer.dataUri();

        const link = document.createElement('a');
        link.href = dataUri;
        link.download = `SongDrumMachine-${songStructure.toLowerCase()}-${bpm}bpm.mid`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        console.log("MIDI export finished.");
    }

    return { exportSong };
})();
