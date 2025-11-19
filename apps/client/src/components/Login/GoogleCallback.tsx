import { useEffect } from 'react'

export default function GoogleCallback() {
  useEffect(() => {
    // Extract id_token from hash or query
    try {
      const hash = window.location.hash || ''
      const search = window.location.search || ''
      const params = new URLSearchParams(hash.replace(/^#/, '') || search)
      const id_token = params.get('id_token')
      if (id_token && window.opener) {
        // send token to opener window
        try { window.opener.postMessage({ type: 'google-id_token', id_token }, window.location.origin) } catch (e) {}
      }
    } catch (e) {
      // ignore
    }
    // close the popup after a short delay to allow the message to be delivered
    setTimeout(() => {
      try { window.close() } catch (e) {}
    }, 300)
  }, [])

  return (
    <div style={{padding:20}}>
      <h3>Signing you in…</h3>
      <p>If this page doesn't close automatically, please copy the URL and paste it into the original window.</p>
    </div>
  )
}
