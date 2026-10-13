interface Diagram {
  figure: HTMLElement;
  canvas: HTMLElement;
  source: HTMLDetailsElement;
  definition: string;
}

export function initializeDiagrams() {
  const blocks = document.querySelectorAll<HTMLPreElement>('pre[data-language="mermaid"], pre:has(> code.language-mermaid)');
  if (!blocks.length) return;

  const diagrams: Diagram[] = [...blocks].map((block) => {
    // Expressive Code stores each line in a separate element without newline text nodes.
    const lines = block.querySelectorAll<HTMLElement>('.ec-line .code');
    const definition = lines.length
      ? [...lines].map((line) => line.textContent ?? '').join('\n')
      : block.textContent ?? '';
    const figure = document.createElement('figure');
    figure.className = 'mermaid-diagram';
    const canvas = document.createElement('div');
    canvas.className = 'mermaid-canvas';
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'region');
    canvas.setAttribute('aria-label', '文章圖表，可左右捲動');
    canvas.setAttribute('aria-busy', 'true');
    const status = document.createElement('p');
    status.className = 'diagram-status';
    status.textContent = '正在載入圖表…';
    canvas.append(status);
    const source = document.createElement('details');
    source.className = 'diagram-source';
    const summary = document.createElement('summary');
    summary.textContent = '圖表文字';
    source.append(summary);
    const original = block.closest('.expressive-code') ?? block;
    original.replaceWith(figure);
    source.append(original);
    figure.append(canvas, source);
    return { figure, canvas, source, definition };
  });

  function showError(diagram: Diagram) {
    const message = document.createElement('p');
    message.className = 'diagram-status';
    message.textContent = '圖表暫時無法顯示，可展開圖表文字閱讀。';
    diagram.canvas.replaceChildren(message);
    diagram.canvas.setAttribute('aria-busy', 'false');
    diagram.figure.dataset.diagramState = 'error';
    diagram.source.open = true;
  }

  let queue = Promise.resolve();
  let renderId = 0;
  function renderDiagrams() {
    queue = queue.then(async () => {
      const { default: mermaid } = await import('mermaid');
      const theme = document.documentElement.dataset.theme ?? 'light';
      const styles = getComputedStyle(document.documentElement);
      const color = (name: string) => styles.getPropertyValue('--wiki-' + name).trim();
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        suppressErrorRendering: true,
        htmlLabels: false,
        theme: 'base',
        fontFamily: color('sans'),
        flowchart: { useMaxWidth: false },
        sequence: { useMaxWidth: false, wrap: false },
        themeVariables: {
          background: color('surface'),
          primaryColor: color('soft'),
          primaryTextColor: color('ink'),
          primaryBorderColor: color('accent'),
          secondaryColor: color('surface'),
          tertiaryColor: color('soft'),
          textColor: color('ink'),
          lineColor: color('muted'),
          clusterBkg: color('surface'),
          clusterBorder: color('line'),
          actorBkg: color('soft'),
          actorBorder: color('accent'),
          actorTextColor: color('ink'),
          signalColor: color('ink'),
          signalTextColor: color('ink'),
          noteBkgColor: color('soft'),
          noteBorderColor: color('accent'),
          noteTextColor: color('ink'),
          activationBkgColor: color('soft'),
          activationBorderColor: color('accent'),
        },
      });
      await document.fonts.ready;
      for (const diagram of diagrams) {
        const container = document.createElement('div');
        diagram.figure.append(container);
        try {
          const { svg } = await mermaid.render('wiki-diagram-' + ++renderId, diagram.definition, container);
          diagram.canvas.innerHTML = svg;
          const graphic = diagram.canvas.querySelector('svg');
          if (graphic) {
            const width = graphic.viewBox.baseVal.width;
            graphic.style.setProperty('--diagram-min-width', Math.min(width, Math.max(320, width * 0.75)) + 'px');
          }
          diagram.canvas.setAttribute('aria-busy', 'false');
          diagram.figure.dataset.diagramState = 'ready';
          diagram.figure.dataset.diagramTheme = theme;
        } catch (error) {
          console.error('文章圖表渲染失敗', error);
          showError(diagram);
        } finally {
          container.remove();
        }
      }
    }).catch((error) => {
      console.error('圖表程式載入失敗', error);
      diagrams.forEach(showError);
    });
  }

  renderDiagrams();
  new MutationObserver(() => renderDiagrams()).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
}
