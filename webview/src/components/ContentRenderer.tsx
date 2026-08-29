import { useMemo, useState } from 'react';
import { Marked } from 'marked';
import hljs from 'highlight.js';
import { Step } from '../types/session';
import { t } from '../i18n';
import './ContentRenderer.css';

// ─── Markdown engine with code-block highlighting ───────────────────────
// One Marked instance is reused across renders. The custom code renderer
// runs each fence through highlight.js so prose blocks pick up the same
// styling as the ToolRenderer's code views.
const marked = new Marked();
marked.setOptions({ gfm: true, breaks: true });
marked.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const code = text;
      const language = (lang || '').trim();
      let html: string;
      try {
        if (language && hljs.getLanguage(language)) {
          html = hljs.highlight(code, { language, ignoreIllegals: true }).value;
        } else {
          html = hljs.highlightAuto(code).value;
        }
      } catch {
        html = escapeHtml(code);
      }
      return `<pre class="cr-code"><code class="hljs language-${language || 'plaintext'}">${html}</code></pre>`;
    },
  },
});

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ─── Component ───────────────────────────────────────────────────────────
interface Props {
  step: Step;
}

// `step.type` values stay raw (they drive the `cr-${kind}` class); only the
// human-readable label is localized.
const KIND_LABEL_KEY: Record<string, string> = {
  text: 'contentRenderer.kindText',
  thinking: 'contentRenderer.kindThinking',
};

const ContentRenderer = ({ step }: Props) => {
  const [showRaw, setShowRaw] = useState(false);
  const content = step.content || '';
  const kind = step.type;
  const label = KIND_LABEL_KEY[kind] ? t(KIND_LABEL_KEY[kind]) : kind;

  const html = useMemo(() => {
    if (!content) return '';
    try {
      return marked.parse(content) as string;
    } catch {
      return `<pre>${escapeHtml(content)}</pre>`;
    }
  }, [content]);

  if (!content) return null;

  return (
    <div className={`content-renderer cr-${kind}`}>
      <div className="cr-toolbar">
        <span className="cr-kind">{label}</span>
        <div className="cr-toggle">
          <button
            type="button"
            className={`cr-toggle-btn${!showRaw ? ' active' : ''}`}
            onClick={() => setShowRaw(false)}
          >
            {t('contentRenderer.pretty')}
          </button>
          <button
            type="button"
            className={`cr-toggle-btn${showRaw ? ' active' : ''}`}
            onClick={() => setShowRaw(true)}
          >
            {t('contentRenderer.raw')}
          </button>
        </div>
      </div>
      {showRaw ? (
        <pre className="cr-raw">{content}</pre>
      ) : (
        <div className="cr-pretty" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  );
};

export default ContentRenderer;
