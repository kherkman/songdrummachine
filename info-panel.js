(function() {
    const infoText = `
        <h3 style="color: var(--accent-color); margin-top: 0; font-family: var(--font-family-header);">Song Arrangement Markers & Guide</h3>
        <p>Use the following structural markers inside the <strong>Song Structure</strong> input to create detailed, professional arrangements:</p>
        <ul style="padding-left: 20px; line-height: 1.5;">
            <li><strong>&lt; (Intro)</strong>: Starts with a 16-step 4/4 count-in sequence triggering 4 open hi-hat hits on the beats (steps 0, 4, 8, 12).</li>
            <li><strong>&gt; (Outro)</strong>: Plays a single crash and kick hit on step 0, leaving the remaining 15 steps empty to resolve the song.</li>
            <li><strong>+ (Crash Accent)</strong>: Prepended to any block (e.g., <code>+A</code>). Triggers a Crash 1 on the first step of that block, while suppressing any other cymbals or hi-hat hits assigned to step 0.</li>
            <li><strong>'BPM' (Tempo Change)</strong>: Enclose a number in single quotes (e.g., <code>'125'</code>) to instantly jump to that tempo at that point in the song.</li>
            <li><strong>*STEPS* (Tempo Ramp)</strong>: Specify step length with asterisks before a tempo change (e.g., <code>*16*'90'</code>) to smoothly transition the tempo to the target BPM over that number of steps.</li>
        </ul>
        <p><strong>Sequencer Guide:</strong></p>
        <ul style="padding-left: 20px; line-height: 1.5;">
            <li>Click steps to toggle hits. Click the <strong>+/-</strong> button to access velocity controls, row randomization, and clear functions.</li>
            <li>Mix and map panning and custom samples inside the <strong>Volume, Pan & Sample</strong> panel.</li>
        </ul>
    `;

    function show() {
        let overlay = document.getElementById('info-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'info-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.85);
                display: flex; justify-content: center; align-items: center;
                z-index: 10000;
                font-family: var(--font-family-body), sans-serif;
            `;

            const modal = document.createElement('div');
            modal.style.cssText = `
                background: var(--panel-bg, #2d2d2d);
                border: 2px solid var(--border-color, #444);
                color: var(--text-color, #e0e0e0);
                padding: 25px;
                border-radius: 8px;
                max-width: 550px;
                width: 90%;
                box-shadow: 0 0 25px rgba(0,0,0,0.8);
                line-height: 1.6;
            `;

            const content = document.createElement('div');
            content.innerHTML = infoText;

            const closeBtn = document.createElement('button');
            closeBtn.textContent = 'Close';
            closeBtn.className = 'primary-action';
            closeBtn.style.cssText = `
                float: right;
                margin-top: 15px;
            `;
            closeBtn.onclick = () => overlay.style.display = 'none';

            modal.appendChild(content);
            modal.appendChild(closeBtn);
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'flex';
    }

    window.DrumMachineInfo = { show };
})();