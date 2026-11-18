export const CHALLENGE_CARD_DECOR_MARKUP = `
  <div class="challenge-card-decor" aria-hidden="true">
    <span class="challenge-decor-card"></span>
    <span class="challenge-decor-card"></span>
    <span class="challenge-decor-card"></span>
  </div>
`;

export const TRIAL_LOCK_EMBLEM_MARKUP = `
  <svg class="trial-lock-emblem-svg" viewBox="0 0 160 160" aria-hidden="true">
    <defs>
      <radialGradient id="v23a-bg-glow" cx="50%" cy="50%" r="54%">
        <stop offset="0%" stop-color="currentColor" stop-opacity="0.14"></stop>
        <stop offset="58%" stop-color="currentColor" stop-opacity="0.05"></stop>
        <stop offset="100%" stop-color="currentColor" stop-opacity="0"></stop>
      </radialGradient>
      <clipPath id="v23a-clip">
        <path d="M 80 20.5 L 139.5 80 L 80 139.5 L 20.5 80 Z"></path>
      </clipPath>
      <path id="v23a-stem" d="M 70.38 142.33 Q 74.93 106.29 79.48 76.25 L 76.52 75.75 Q 71.07 105.71 65.62 141.67 Z"></path>
      <g id="v23a-lf-0">
        <path d="M 74.5 101.1 Q 71.3 96.25 67.15 89.33 L 64.96 90.55 Q 68.7 97.75 71.5 102.9 Z"></path>
        <path d="M 68 94 C 73.84 76.45 59.92 54.79 45 46 C 39.87 64.39 48.14 88.76 68 94 Z"></path>
      </g>
      <mask id="v23a-lm-0">
        <rect width="160" height="160" fill="white"></rect>
        <path d="M 66.54 91.37 C 63.28 83.28 54.45 65.57 49.6 55.6 C 51.91 66.77 60.02 84.82 66.54 91.37 Z" fill="black"></path><path d="M 63.49 79.49 L 75.25 61.91 L 71.75 60.21 Z" fill="black"></path><path d="M 56.93 82.64 L 37.15 75.15 L 36.28 78.94 Z" fill="black"></path><path d="M 57.36 67.09 L 69.11 49.51 L 65.62 47.81 Z" fill="black"></path><path d="M 50.79 70.23 L 31.01 62.75 L 30.15 66.53 Z" fill="black"></path>
        <path d="M 81.13 87.66 C 103.91 92.64 121.08 72.31 122.14 51.21 C 102.99 51.97 80.72 66.55 81.13 87.66 Z" fill="black"></path><path d="M 64.56 116.96 C 68.72 95.6 48.7 76.85 29.39 72.71 C 27.09 94.03 41.01 117.63 64.56 116.96 Z" fill="black"></path><path d="M 75.61 91.47 C 97.63 77.12 98.22 42.96 86.66 21.85 C 64.4 37.59 54.27 70.24 75.61 91.47 Z" fill="black"></path>
      </mask>
      <g id="v23a-lf-1">
        <path d="M 76.37 97.09 Q 80.14 91.98 87.28 83.86 L 85.44 82.16 Q 77.86 90.02 73.63 94.91 Z"></path>
        <path d="M 83 86 C 102.4 89.7 117.63 72.03 119 54 C 102.86 55.42 83.46 68.4 83 86 Z"></path>
      </g>
      <mask id="v23a-lm-1">
        <rect width="160" height="160" fill="white"></rect>
        <path d="M 85.36 84.14 C 93.24 81.22 106.2 69.05 111.8 60.4 C 104.32 66.96 90.84 78.54 85.36 84.14 Z" fill="black"></path><path d="M 96.4 80.88 L 116.54 87.33 L 117.21 83.5 Z" fill="black"></path><path d="M 91.56 75.44 L 93.29 54.37 L 89.41 54.58 Z" fill="black"></path><path d="M 105.87 72.69 L 126.01 79.13 L 126.68 75.31 Z" fill="black"></path><path d="M 101.04 67.25 L 102.77 46.17 L 98.89 46.39 Z" fill="black"></path>
        <path d="M 64.56 116.96 C 68.72 95.6 48.7 76.85 29.39 72.71 C 27.09 94.03 41.01 117.63 64.56 116.96 Z" fill="black"></path><path d="M 75.61 91.47 C 97.63 77.12 98.22 42.96 86.66 21.85 C 64.4 37.59 54.27 70.24 75.61 91.47 Z" fill="black"></path>
      </mask>
      <g id="v23a-lf-2">
        <path d="M 71.08 120.56 Q 67.09 117.9 61.23 110.68 L 59.17 112.27 Q 64.91 120.1 68.92 123.44 Z"></path>
        <path d="M 63 115 C 65.7 96.94 48.24 80.28 32 76 C 30.53 94.35 43 114.99 63 115 Z"></path>
      </g>
      <mask id="v23a-lm-2">
        <rect width="160" height="160" fill="white"></rect>
        <path d="M 60.99 112.76 C 56.38 106.07 44.67 91.84 38.2 83.8 C 42.47 93.57 53.55 108.3 60.99 112.76 Z" fill="black"></path><path d="M 55.39 101.96 L 63.1 81.5 L 59.31 80.62 Z" fill="black"></path><path d="M 49.7 106.49 L 28.02 103.6 L 28.02 107.49 Z" fill="black"></path><path d="M 47.25 91.89 L 54.96 71.43 L 51.17 70.55 Z" fill="black"></path><path d="M 41.56 96.42 L 19.88 93.53 L 19.88 97.41 Z" fill="black"></path>
        <path d="M 75.61 91.47 C 97.63 77.12 98.22 42.96 86.66 21.85 C 64.4 37.59 54.27 70.24 75.61 91.47 Z" fill="black"></path>
      </mask>
      <g id="v23a-lf-3">
        <path d="M 76.89 98.19 Q 77.19 93.2 78.19 84.77 L 75.22 84.34 Q 73.81 92.8 73.11 97.81 Z"></path>
        <path d="M 76 89 C 94.6 75.81 95.38 44.93 86 26 C 66.49 40.34 57.56 69.93 76 89 Z"></path>
      </g>
      <mask id="v23a-lm-3">
        <rect width="160" height="160" fill="white"></rect>
        <path d="M 76.23 86 C 78.22 75.62 81.67 51.85 84 38.6 C 78.59 51.34 74.27 74.97 76.23 86 Z" fill="black"></path><path d="M 81.25 76.36 L 106.57 65.37 L 104.66 61.99 Z" fill="black"></path><path d="M 71.75 74.85 L 55.34 52.66 L 52.47 55.28 Z" fill="black"></path><path d="M 82.79 63.04 L 108.11 52.05 L 106.2 48.67 Z" fill="black"></path><path d="M 73.28 61.53 L 56.87 39.34 L 54 41.96 Z" fill="black"></path><path d="M 84.96 50.47 L 110.28 39.48 L 108.37 36.1 Z" fill="black"></path><path d="M 75.46 48.96 L 59.04 26.77 L 56.18 29.39 Z" fill="black"></path>
      </mask>
      <mask id="v23a-stem-mask">
        <rect width="160" height="160" fill="white"></rect>
        <path d="M 69.08 96.25 C 77.08 75.81 61.14 51.55 43.19 42.21 C 36.59 63.31 45.61 90.89 69.08 96.25 Z" fill="black"></path><path d="M 81.13 87.66 C 103.91 92.64 121.08 72.31 122.14 51.21 C 102.99 51.97 80.72 66.55 81.13 87.66 Z" fill="black"></path><path d="M 64.56 116.96 C 68.72 95.6 48.7 76.85 29.39 72.71 C 27.09 94.03 41.01 117.63 64.56 116.96 Z" fill="black"></path><path d="M 75.61 91.47 C 97.63 77.12 98.22 42.96 86.66 21.85 C 64.4 37.59 54.27 70.24 75.61 91.47 Z" fill="black"></path>
      </mask>
      <mask id="v23a-stripes-mask">
        <rect width="160" height="160" fill="white"></rect>
        <polygon points="0,0 74,0 70,160 0,160" fill="black"></polygon><use href="#v23a-stem" fill="black" stroke="black" stroke-width="11.5" stroke-linejoin="round" stroke-linecap="round"></use><path d="M 74.5 101.1 Q 71.3 96.25 67.15 89.33 L 64.96 90.55 Q 68.7 97.75 71.5 102.9 Z" fill="black" stroke="black" stroke-width="10.5" stroke-linejoin="round" stroke-linecap="round"></path><path d="M 70.16 98.51 C 79.86 76.06 62.55 50.17 42.41 40.59 C 34.63 63.55 44.06 93.21 70.16 98.51 Z" fill="black"></path><path d="M 76.37 97.09 Q 80.14 91.98 87.28 83.86 L 85.44 82.16 Q 77.86 90.02 73.63 94.91 Z" fill="black" stroke="black" stroke-width="10.5" stroke-linejoin="round" stroke-linecap="round"></path><path d="M 79.26 89.32 C 104.44 95.38 122.8 73.29 123.48 50.01 C 102.22 50.14 78.06 65.71 79.26 89.32 Z" fill="black"></path><path d="M 71.08 120.56 Q 67.09 117.9 61.23 110.68 L 59.17 112.27 Q 64.91 120.1 68.92 123.44 Z" fill="black" stroke="black" stroke-width="10.5" stroke-linejoin="round" stroke-linecap="round"></path><path d="M 66.11 118.91 C 71.48 95.22 49.77 75.19 28.27 71.3 C 25.23 94.7 40.02 120.23 66.11 118.91 Z" fill="black"></path><path d="M 76.89 98.19 Q 77.19 93.2 78.19 84.77 L 75.22 84.34 Q 73.81 92.8 73.11 97.81 Z" fill="black" stroke="black" stroke-width="10.5" stroke-linejoin="round" stroke-linecap="round"></path><path d="M 75.22 93.94 C 99.78 78.91 100.17 42.62 86.94 20.07 C 62.65 36.66 51.68 71.27 75.22 93.94 Z" fill="black"></path>
      </mask>
    </defs>
    <path d="M 80 11 L 149 80 L 80 149 L 11 80 Z" fill="url(#v23a-bg-glow)" stroke="currentColor" stroke-width="5.5" stroke-linejoin="miter"></path>
    <g clip-path="url(#v23a-clip)">
      <g mask="url(#v23a-stripes-mask)">
        <line x1="72" y1="91" x2="142" y2="91" stroke="currentColor" stroke-width="3.6"></line><line x1="72" y1="101" x2="142" y2="101" stroke="currentColor" stroke-width="3.6"></line><line x1="72" y1="111" x2="142" y2="111" stroke="currentColor" stroke-width="3.6"></line><line x1="72" y1="121" x2="142" y2="121" stroke="currentColor" stroke-width="3.6"></line>
      </g>
      <use href="#v23a-stem" fill="currentColor" mask="url(#v23a-stem-mask)"></use>
      <use href="#v23a-lf-0" fill="currentColor" mask="url(#v23a-lm-0)"></use><use href="#v23a-lf-1" fill="currentColor" mask="url(#v23a-lm-1)"></use><use href="#v23a-lf-2" fill="currentColor" mask="url(#v23a-lm-2)"></use><use href="#v23a-lf-3" fill="currentColor" mask="url(#v23a-lm-3)"></use>
    </g>
  </svg>
`;
