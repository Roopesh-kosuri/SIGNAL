import { useEffect } from 'react'

export default function PageMeta({ title, description }) {
  useEffect(() => {
    const baseTitle = 'SIGNAL'
    document.title = title ? `${title} — ${baseTitle}` : baseTitle

    if (description) {
      let metaDescription = document.querySelector('meta[name="description"]')
      if (metaDescription) {
        metaDescription.setAttribute('content', description)
      }
      let ogDesc = document.querySelector('meta[property="og:description"]')
      if (ogDesc) {
        ogDesc.setAttribute('content', description)
      }
    }

    let ogTitle = document.querySelector('meta[property="og:title"]')
    if (ogTitle) {
      ogTitle.setAttribute('content', title ? `${title} — ${baseTitle}` : baseTitle)
    }

    return () => {}
  }, [title, description])

  return null
}
