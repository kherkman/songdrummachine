const RockForgeExporter = {
    /**
     * Generates a random fill pattern.
     * @param {number} numSteps - The number of steps in the fill.
     * @param {string[]} fillInstruments - An array of instrument names to use for the fill.
     * @returns {object} A grid-like object representing the fill pattern.
     */
    _generateFillPattern: function(numSteps, fillInstruments) {
        const fillGrid = {};
        // Initialize grid for all possible instruments.
        const allInstruments = [
            'crash1', 'crash2', 'ride', 'china',
            'tom1', 'tom2', 'tom3', 'floor-tom',
            'hi-hat-open', 'hi-hat-closed', 'snare', 'kick'
        ];
        allInstruments.forEach(instrument => {
            fillGrid[instrument] = Array(numSteps).fill(false);
        });

        for (let i = 0; i < numSteps; i++) {
            const randomInstrument = fillInstruments[Math.floor(Math.random() * fillInstruments.length)];
            fillGrid[randomInstrument][i] = true;
        }
        return fillGrid;
    },

    /**
     * Exports a song to a .mid file.
     * @param {object} params - The parameters for the export.
     * @param {string} params.songStructure - The string defining the song arrangement (e.g., "AB1C").
     * @param {object} params.sequencersData - The main data object for all sequencers.
     * @param {number} params.bpm - The tempo of the song in beats per minute.
     * @param {string[]} params.INSTRUMENTS - Array of all instrument names.
     * @param {object} params.INSTRUMENT_MIDI_NOTES - Mapping of instrument names to MIDI note numbers.
     * @param {string[]} params.FILL_INSTRUMENTS - Array of instrument names to use for fills.
     */
    exportSong: function({ songStructure, sequencersData, bpm, INSTRUMENTS, INSTRUMENT_MIDI_NOTES, FILL_INSTRUMENTS }) {
        if (typeof window.MidiWriter === 'undefined') {
            alert('MIDI library is not ready yet.');
            console.error('MidiWriter object not found on window.');
            return;
        }

        try {
            if (!songStructure) {
                alert('Please enter a song structure to export.');
                return;
            }
            
            const songItems = [...songStructure];
            const track = new window.MidiWriter.Track();
            track.setTempo(bpm);
            track.addEvent(new window.MidiWriter.ProgramChangeEvent({instrument: 1, channel: 10}));

            let totalTicks = 0;
            const ticksPerStep = 128;

            // ADDED: Variable to track the last used sequencer for fill sounds
            let lastValidSequencerId = null;

            songItems.forEach(item => {
                let gridToUse, numSteps, currentSequencerData;

                if (/^[A-Z]$/.test(item)) {
                    const sequencerId = Object.keys(sequencersData).find(key => sequencersData[key].name === item);
                    if (!sequencerId) {
                        console.warn(`Skipping unknown section "${item}" in MIDI export.`);
                        return; // continue forEach
                    }
                    // ADDED: Track this sequencer as the last valid one
                    lastValidSequencerId = sequencerId;

                    currentSequencerData = sequencersData[sequencerId];
                    gridToUse = currentSequencerData.grid;
                    numSteps = currentSequencerData.steps;

                } else if (/^[1-9]$/.test(item)) {
                    numSteps = parseInt(item, 10);
                    gridToUse = this._generateFillPattern(numSteps, FILL_INSTRUMENTS);
                    
                    // --- CHANGED: This block is the core of the fix ---
                    // Use the last tracked sequencer ID. If none exists (e.g., song starts with a fill),
                    // fall back to the first available sequencer.
                    const sequencerIdForFillSounds = lastValidSequencerId || Object.keys(sequencersData)[0];

                    if (!sequencerIdForFillSounds) {
                        console.warn(`Skipping fill section in MIDI export because no preceding section or default sequencer exists.`);
                        return; // continue forEach
                    }
                    currentSequencerData = sequencersData[sequencerIdForFillSounds];
                    // --- END OF CHANGE ---

                } else {
                    return; // Skip invalid items
                }

                for (let step = 0; step < numSteps; step++) {
                    const notesForThisStep = [];
                    INSTRUMENTS.forEach(instrument => {
                        // Ensure the instrument exists in the grid (important for fills)
                        if (gridToUse[instrument] && gridToUse[instrument][step] && INSTRUMENT_MIDI_NOTES[instrument]) {
                            notesForThisStep.push(new window.MidiWriter.NoteEvent({ 
                                pitch: [INSTRUMENT_MIDI_NOTES[instrument]], 
                                duration: '16', 
                                // Use the correct sequencer's velocity data
                                velocity: Math.round(currentSequencerData.velocities[instrument][step] / 127 * 100), 
                                startTick: totalTicks + (step * ticksPerStep), 
                                channel: 10 
                            }));
                        }
                    });
                    if (notesForThisStep.length > 0) {
                        track.addEvent(notesForThisStep, () => ({ sequential: false }));
                    }
                }
                totalTicks += numSteps * ticksPerStep;
            });

            const writer = new window.MidiWriter.Writer([track]);
            const link = document.createElement('a');
            link.href = writer.dataUri();
            link.download = "rockforge_song.mid";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch(error) {
            console.error("Error exporting MIDI:", error);
            alert("An error occurred during MIDI export: " + error.message);
        }
    }
};
