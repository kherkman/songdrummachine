(function() {
    class MasteringProcessor {
        constructor(context) {
            this.ctx = context;
            this.input = context.createGain();
            this.output = context.createGain();

            this.states = {
                saturation: false,
                compressor: false,
                delay: false,
                reverb: false,
                limiter: false
            };

            // Custom Mix properties
            this.satMixValue = 0.4;
            this.reverbMixValue = 0.15;

            this.initNodes();
            this.connectNodes();
            this.updateBypassGains();
        }

        initNodes() {
            // SATURATION
            this.satNode = this.ctx.createWaveShaper();
            this.satNode.curve = this.makeDistortionCurve(20);
            this.satNode.oversample = '4x';
            this.satWet = this.ctx.createGain();
            this.satDry = this.ctx.createGain();

            // COMPRESSOR
            this.compNode = this.ctx.createDynamicsCompressor();
            this.compNode.threshold.setValueAtTime(-24, this.ctx.currentTime);
            this.compNode.ratio.setValueAtTime(4, this.ctx.currentTime);
            this.compNode.attack.setValueAtTime(0.01, this.ctx.currentTime);
            this.compNode.release.setValueAtTime(0.25, this.ctx.currentTime);
            this.compWet = this.ctx.createGain();
            this.compDry = this.ctx.createGain();

            // ROOM DELAY
            this.delayNode = this.ctx.createDelay();
            this.delayNode.delayTime.setValueAtTime(0.15, this.ctx.currentTime);
            this.delayFeedback = this.ctx.createGain();
            this.delayFeedback.gain.setValueAtTime(0.3, this.ctx.currentTime);
            this.delayWet = this.ctx.createGain();
            this.delayDry = this.ctx.createGain();

            // REVERB
            this.revNode = this.ctx.createConvolver();
            this.setReverbDecay(1.5);
            this.revWet = this.ctx.createGain();
            this.revDry = this.ctx.createGain();

            // LIMITER
            this.limiterNode = this.ctx.createDynamicsCompressor();
            this.limiterNode.threshold.setValueAtTime(-1.0, this.ctx.currentTime);
            this.limiterNode.ratio.setValueAtTime(20.0, this.ctx.currentTime);
            this.limiterNode.attack.setValueAtTime(0.001, this.ctx.currentTime);
            this.limiterNode.release.setValueAtTime(0.05, this.ctx.currentTime);
            this.limWet = this.ctx.createGain();
            this.limDry = this.ctx.createGain();
        }

        connectNodes() {
            const c = this.ctx;

            // Saturation routing
            this.input.connect(this.satNode).connect(this.satWet);
            this.input.connect(this.satDry);
            this.satOut = c.createGain();
            this.satWet.connect(this.satOut);
            this.satDry.connect(this.satOut);

            // Compressor routing
            this.satOut.connect(this.compNode).connect(this.compWet);
            this.satOut.connect(this.compDry);
            this.compOut = c.createGain();
            this.compWet.connect(this.compOut);
            this.compDry.connect(this.compOut);

            // Room Delay routing
            this.delayNode.connect(this.delayFeedback).connect(this.delayNode);
            this.compOut.connect(this.delayNode).connect(this.delayWet);
            this.compOut.connect(this.delayDry);
            this.delayOut = c.createGain();
            this.delayWet.connect(this.delayOut);
            this.delayDry.connect(this.delayOut);

            // Reverb routing
            this.delayOut.connect(this.revNode).connect(this.revWet);
            this.delayOut.connect(this.revDry);
            this.revOut = c.createGain();
            this.revWet.connect(this.revOut);
            this.revDry.connect(this.revOut);

            // Limiter routing
            this.revOut.connect(this.limiterNode).connect(this.limWet);
            this.revOut.connect(this.limDry);
            this.limWet.connect(this.output);
            this.limDry.connect(this.output);
        }

        makeDistortionCurve(amount) {
            const k = typeof amount === 'number' ? amount : 50;
            const n_samples = 44100;
            const curve = new Float32Array(n_samples);
            const deg = Math.PI / 180;
            for (let i = 0; i < n_samples; ++i) {
                const x = (i * 2) / n_samples - 1;
                curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
            }
            return curve;
        }

        setReverbDecay(decayTime) {
            const sampleRate = this.ctx.sampleRate;
            const length = sampleRate * decayTime;
            const impulse = this.ctx.createBuffer(2, length, sampleRate);
            const left = impulse.getChannelData(0);
            const right = impulse.getChannelData(1);
            for (let i = 0; i < length; i++) {
                const percent = i / length;
                const decayFactor = Math.exp(-percent * 4);
                left[i] = (Math.random() * 2 - 1) * decayFactor;
                right[i] = (Math.random() * 2 - 1) * decayFactor;
            }
            this.revNode.buffer = impulse;
        }

        updateBypassGains() {
            const c = this.ctx;
            // Saturation Wet/Dry mix
            const satMix = this.states.saturation ? this.satMixValue : 0;
            this.satWet.gain.setValueAtTime(satMix, c.currentTime);
            this.satDry.gain.setValueAtTime(1 - satMix, c.currentTime);

            // Compressor Full Wet or Full Dry
            const compWetVal = this.states.compressor ? 1.0 : 0;
            this.compWet.gain.setValueAtTime(compWetVal, c.currentTime);
            this.compDry.gain.setValueAtTime(1 - compWetVal, c.currentTime);

            // Room Delay Wet/Dry mix
            const delayMix = this.states.delay ? 0.25 : 0;
            this.delayWet.gain.setValueAtTime(delayMix, c.currentTime);
            this.delayDry.gain.setValueAtTime(1 - delayMix, c.currentTime);

            // Reverb Wet/Dry mix
            const revMix = this.states.reverb ? this.reverbMixValue : 0;
            this.revWet.gain.setValueAtTime(revMix, c.currentTime);
            this.revDry.gain.setValueAtTime(1 - revMix, c.currentTime);

            // Limiter Full Wet or Full Dry
            const limWetVal = this.states.limiter ? 1.0 : 0;
            this.limWet.gain.setValueAtTime(limWetVal, c.currentTime);
            this.limDry.gain.setValueAtTime(1 - limWetVal, c.currentTime);
        }
    }

    window.MasteringProcessor = MasteringProcessor;
})();