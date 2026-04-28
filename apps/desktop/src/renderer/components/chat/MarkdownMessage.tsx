import { Streamdown, type Components } from 'streamdown'

function toOpenableUrl(href: string | undefined): string | null {
  if (!href) {
    return null
  }

  try {
    const url = new URL(href, window.location.href)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

const markdownComponents: Components = {
  a({ href, children, ...props }) {
    const openableUrl = toOpenableUrl(href)

    return (
      <a
        {...props}
        href={openableUrl ?? href}
        className="message-link"
        rel="noreferrer"
        target="_blank"
        onClick={(event) => {
          if (!openableUrl) {
            return
          }

          event.preventDefault()

          if (window.desktop?.openExternalUrl) {
            void window.desktop.openExternalUrl({ url: openableUrl }).catch(() => {
              window.open(openableUrl, '_blank', 'noopener,noreferrer')
            })
            return
          }

          window.open(openableUrl, '_blank', 'noopener,noreferrer')
        }}
      >
        {children}
      </a>
    )
  },
}

export function MarkdownMessage({ content, streaming = false }: { content: string; streaming?: boolean }) {
  return (
    <Streamdown
      className="message-markdown"
      components={markdownComponents}
      isAnimating={streaming || undefined}
      mode={streaming ? 'streaming' : undefined}
    >
      {content}
    </Streamdown>
  )
}
