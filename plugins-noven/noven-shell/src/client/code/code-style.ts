/** Inline-code styles included in the shell's existing stylesheet payload. */
export const CODE_CSS = `
/* Inline code components: demo geometry rebound to DSH semantic tokens. */
.nv-code-root {
  width: 100%;
  min-width: 0;
  container-type: inline-size;
  color: var(--dsw-alias-label-primary);
  font: var(--dsw-font-xs-13);
}

.nv-code-root button {
  font: inherit;
}

.nv-code-root button:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 2px;
}

.nv-code-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.nv-code-split {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-items: start;
}

.nv-code-frame {
  min-width: 0;
  padding: 12px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
}

.nv-code-frame.nv-code-accent,
.nv-code-badge.nv-code-accent {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-state-business-primary);
}

.nv-code-frame.nv-code-warning,
.nv-code-badge.nv-code-warning {
  color: var(--dsw-alias-state-warn-primary);
}

.nv-code-title {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 10px;
  color: var(--dsw-alias-label-secondary);
  font: var(--dsw-font-xxs-12);
}

.nv-code-title strong {
  color: var(--dsw-alias-label-primary);
  font-weight: 500;
}

.nv-code-badges {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 6px;
}

.nv-code-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font: var(--dsw-font-xxs-12);
}

.nv-code-iconText {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.nv-code-iconText svg {
  flex: 0 0 auto;
  color: var(--dsw-alias-state-business-primary);
}

.nv-code-mediaImage {
  display: flex;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2);
  object-position: center;
}

.nv-code-mediaImage.nv-code-cover {
  object-fit: cover;
}

.nv-code-mediaImage.nv-code-contain {
  object-fit: contain;
}

.nv-code-mediaFallback {
  min-height: 96px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  color: var(--dsw-alias-label-secondary);
  text-align: center;
}

.nv-code-dialogue {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.nv-code-turn {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr);
  gap: 12px;
  align-items: end;
}

.nv-code-turn.nv-code-reverse {
  grid-template-columns: minmax(0, 1fr) 132px;
}

.nv-code-turn.nv-code-reverse .nv-code-portrait,
.nv-code-turn.nv-code-reverse .nv-code-portraitFallback {
  grid-column: 2;
  grid-row: 1;
}

.nv-code-turn.nv-code-reverse .nv-code-speech {
  grid-column: 1;
  grid-row: 1;
  border-radius: 10px 10px 3px 10px;
}

.nv-code-portrait,
.nv-code-portraitFallback {
  height: 164px;
}

.nv-code-portraitFallback {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-state-business-primary);
  font-size: 28px;
}

.nv-code-speech {
  min-width: 0;
  margin-bottom: 3px;
  padding: 12px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 10px 10px 10px 3px;
  background: var(--dsw-alias-bg-layer-1);
}

.nv-code-speaker {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
  margin-bottom: 7px;
}

.nv-code-speaker strong {
  font-weight: 500;
}

.nv-code-line {
  margin: 0;
  line-height: 1.75;
  white-space: pre-wrap;
}

.nv-code-narration {
  padding: 12px 14px;
  border-left: 3px solid var(--dsw-alias-state-business-primary);
  border-radius: 0 10px 10px 0;
  background: var(--dsw-alias-bg-layer-2);
}

.nv-code-narration p {
  margin: 0;
  line-height: 1.8;
  white-space: pre-wrap;
}

.nv-code-narration em {
  display: block;
  margin-top: 7px;
  color: var(--dsw-alias-label-secondary);
}

.nv-code-context {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 7px;
  color: var(--dsw-alias-label-secondary);
  font: var(--dsw-font-xxs-12);
}

.nv-code-story {
  overflow: hidden;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
}

.nv-code-story .nv-code-mediaImage {
  border-radius: 0;
}

.nv-code-caption {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  padding: 12px;
}

.nv-code-caption > svg {
  margin-top: 3px;
  color: var(--dsw-alias-state-business-primary);
}

.nv-code-caption p {
  margin: 0;
  line-height: 1.7;
}

.nv-code-caption strong {
  display: block;
  font-weight: 500;
}

.nv-code-choices {
  display: grid;
  gap: 8px;
}

.nv-code-choice {
  width: 100%;
  display: grid;
  grid-template-columns: 25px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  padding: 10px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 9px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  text-align: left;
  cursor: pointer;
}

.nv-code-choice:hover:not(:disabled),
.nv-code-action:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}

.nv-code-choice[aria-pressed='true'],
.nv-code-action[aria-pressed='true'] {
  border-color: var(--dsw-alias-state-business-primary);
  background: var(--dsw-alias-interactive-bg-hover);
  box-shadow: inset 3px 0 var(--dsw-alias-state-business-primary);
}

.nv-code-choice:disabled,
.nv-code-action:disabled {
  cursor: default;
  opacity: 0.65;
}

.nv-code-choiceKey {
  width: 23px;
  height: 23px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font: var(--dsw-font-xxs-12);
}

.nv-code-choice small {
  display: block;
  margin-top: 3px;
  color: var(--dsw-alias-label-secondary);
  font: var(--dsw-font-xxs-12);
  line-height: 1.5;
}

.nv-code-choiceCheck {
  display: inline-flex;
  color: var(--dsw-alias-state-business-primary);
  opacity: 0;
}

.nv-code-choice[aria-pressed='true'] .nv-code-choiceCheck,
.nv-code-mediaItem[aria-pressed='true'] .nv-code-choiceCheck {
  opacity: 1;
}

.nv-code-diffRow {
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr);
  gap: 10px;
  padding: 9px 0;
  border-top: 0.5px solid var(--dsw-alias-border-l3);
  line-height: 1.65;
}

.nv-code-diffRow:first-of-type {
  padding-top: 0;
  border-top: 0;
}

.nv-code-diffRow > span:first-child {
  color: var(--dsw-alias-label-secondary);
  font: var(--dsw-font-xxs-12);
}

.nv-code-old {
  color: var(--dsw-alias-label-secondary);
  text-decoration: line-through;
  text-decoration-color: var(--dsw-alias-state-error-primary);
}

.nv-code-new {
  color: var(--dsw-alias-state-business-primary);
}

.nv-code-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.nv-code-action {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 5px 11px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  font: var(--dsw-font-xxs-12);
}

.nv-code-conflicts {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.nv-code-conflict {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 9px;
}

.nv-code-conflict > svg {
  margin-top: 2px;
  color: var(--dsw-alias-state-warn-primary);
}

.nv-code-conflict p {
  margin: 0;
  line-height: 1.65;
}

.nv-code-mediaGrid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 9px;
}

.nv-code-mediaItem {
  min-width: 0;
  overflow: hidden;
  padding: 0;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  text-align: left;
}

.nv-code-mediaItem .nv-code-mediaImage {
  border-radius: 0;
}

.nv-code-mediaItem[aria-pressed='true'],
.nv-code-color[aria-pressed='true'] {
  border-color: var(--dsw-alias-state-business-primary);
  box-shadow: 0 0 0 2px var(--dsw-alias-state-business-primary);
}

.nv-code-mediaLabel {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px;
}

.nv-code-palette {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.nv-code-color {
  min-width: 0;
  overflow: hidden;
  padding: 0;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 9px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  text-align: left;
}

.nv-code-swatch {
  display: block;
  height: 50px;
}

.nv-code-colorLabel {
  display: block;
  padding: 7px 8px;
  background: var(--dsw-alias-bg-layer-1);
}

.nv-code-colorLabel strong {
  display: block;
  overflow: hidden;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nv-code-colorLabel span {
  display: block;
  margin-top: 2px;
  color: var(--dsw-alias-label-secondary);
  font: var(--dsw-font-xxs-12);
}

.nv-code-stat {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.nv-code-stat strong {
  font-size: 24px;
  line-height: 28px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.nv-code-stat span,
.nv-code-note {
  color: var(--dsw-alias-label-secondary);
  font: var(--dsw-font-xxs-12);
}

.nv-code-note {
  margin: 6px 0 0;
  line-height: 1.6;
}

.nv-code-meter + .nv-code-meter {
  margin-top: 12px;
}

.nv-code-meterHead {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
  font: var(--dsw-font-xxs-12);
}

.nv-code-meterHead span:last-child {
  color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
}

.nv-code-track {
  display: block;
  height: 7px;
  overflow: hidden;
  border-radius: 5px;
  background: var(--dsw-alias-bg-layer-2);
}

.nv-code-fill {
  display: block;
  height: 100%;
  border-radius: 5px;
  background: var(--dsw-alias-state-business-primary);
}

.nv-code-bars {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.nv-code-barRow {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) 44px;
  align-items: center;
  gap: 9px;
}

.nv-code-barRow .nv-code-track {
  height: 12px;
}

.nv-code-barValue {
  color: var(--dsw-alias-label-secondary);
  font: var(--dsw-font-xxs-12);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.nv-code-chartScale {
  display: flex;
  justify-content: space-between;
  margin: 9px 0 0 61px;
  color: var(--dsw-alias-label-tertiary);
  font: var(--dsw-font-xxs-12);
}

.nv-code-chart {
  width: 100%;
  min-width: 0;
}

.nv-code-chartSvg {
  display: block;
  width: 100%;
  height: auto;
}

.nv-code-gridLine {
  stroke: var(--dsw-alias-border-l3);
  stroke-width: 1;
}

.nv-code-axisLine {
  stroke: var(--dsw-alias-border-l2);
  stroke-width: 1;
}

.nv-code-axisText {
  fill: var(--dsw-alias-label-secondary);
  font-size: 11px;
}

.nv-code-valueText {
  fill: var(--dsw-alias-label-primary);
  font-size: 12px;
  font-weight: 500;
}

.nv-code-linePath {
  fill: none;
  stroke: var(--dsw-alias-state-business-primary);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.nv-code-linePoint {
  fill: var(--dsw-alias-bg-layer-1);
  stroke: var(--dsw-alias-state-business-primary);
  stroke-width: 2.5;
}

.nv-code-radarGrid {
  fill: none;
  stroke: var(--dsw-alias-border-l3);
  stroke-width: 1;
}

.nv-code-radarLabel {
  fill: var(--dsw-alias-label-secondary);
  font-size: 12px;
}

.nv-code-radarValue {
  fill: var(--dsw-alias-state-business-primary);
  fill-opacity: 0.22;
  stroke: var(--dsw-alias-state-business-primary);
  stroke-width: 2.5;
  stroke-linejoin: round;
}

.nv-code-radarPoint {
  fill: var(--dsw-alias-state-business-primary);
}

.nv-code-radarValues {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  margin-top: -4px;
}

.nv-code-invalid {
  margin: 0;
  padding: 14px;
  color: var(--dsw-alias-state-error-primary);
}

@container (max-width: 560px) {
  .nv-code-split {
    grid-template-columns: minmax(0, 1fr);
  }

  .nv-code-turn {
    grid-template-columns: 96px minmax(0, 1fr);
    gap: 9px;
  }

  .nv-code-turn.nv-code-reverse {
    grid-template-columns: minmax(0, 1fr) 96px;
  }

  .nv-code-portrait,
  .nv-code-portraitFallback {
    height: 132px;
  }

  .nv-code-palette {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@container (max-width: 380px) {
  .nv-code-turn,
  .nv-code-turn.nv-code-reverse {
    grid-template-columns: minmax(0, 1fr);
  }

  .nv-code-turn.nv-code-reverse .nv-code-portrait,
  .nv-code-turn.nv-code-reverse .nv-code-portraitFallback,
  .nv-code-turn.nv-code-reverse .nv-code-speech {
    grid-column: 1;
  }

  .nv-code-turn.nv-code-reverse .nv-code-portrait,
  .nv-code-turn.nv-code-reverse .nv-code-portraitFallback {
    grid-row: 1;
  }

  .nv-code-turn.nv-code-reverse .nv-code-speech {
    grid-row: 2;
  }

  .nv-code-mediaGrid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (prefers-reduced-motion: no-preference) {
  .nv-code-root button {
    transition: background-color 120ms ease, color 120ms ease, box-shadow 120ms ease;
  }
}

`
