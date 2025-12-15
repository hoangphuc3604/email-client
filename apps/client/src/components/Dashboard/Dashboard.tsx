import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Container,
  Row,
  Col,
  ListGroup,
  Card,
  Button,
  Badge,
  Modal,
  Form,
} from 'react-bootstrap'
import Particle from '../Particle'
import './Dashboard.css'
import mailApi from '../../api/mail'
import {
  FaInbox,
  FaStar,
  FaRegStar,
  FaPaperPlane,
  FaTrash,
  FaSync,
  FaReply,
  FaForward,
  FaCheckSquare,
  FaEnvelopeOpen,
  FaEnvelope,
  FaFileArchive,
  FaPen,
  FaDownload,
  FaClock,
  FaTasks,
} from 'react-icons/fa'
import { BiEdit } from 'react-icons/bi'
import { OverlayTrigger, Tooltip } from 'react-bootstrap'
import { BsKanban, BsListUl } from 'react-icons/bs'; 
import { AiOutlineClose } from 'react-icons/ai'; // [Cập nhật] Icon đóng
import KanbanBoard from './KanbanBoard'; 
import { useSearchParams } from 'react-router-dom'; // [Cập nhật] Hook lấy query param

// Map Gmail label IDs to friendly names
const LABEL_NAME_MAP: Record<string, string> = {
  'INBOX': 'Inbox',
  'STARRED': 'Starred',
  'SENT': 'Sent',
  'DRAFT': 'Drafts',
  'TRASH': 'Trash',
  'SNOOZED': 'Snoozed',
  'TODO': 'Todo',
  'DONE': 'Done',
}

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

export default function Dashboard() {
  const [selectedFolder, setSelectedFolder] = useState('inbox')
  const [selectedEmail, setSelectedEmail] = useState<any | null>(null)
  const [mailboxes, setMailboxes] = useState<any[]>([])
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [previewsMap, setPreviewsMap] = useState<Record<string, any[]>>(() => {
    try {
      const saved = localStorage.getItem('email_previews_map')
      return saved ? JSON.parse(saved) : {}
    } catch (e) {
      return {}
    }
  })
  const [loadedFolders, setLoadedFolders] = useState<Set<string>>(new Set())
  const [foldersNeedReload, setFoldersNeedReload] = useState<Set<string>>(new Set())
  const [pageTokenMap, setPageTokenMap] = useState<Record<string, string | null>>({})
  const [hasMoreMap, setHasMoreMap] = useState<Record<string, boolean>>({})
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({})
  const [showCompose, setShowCompose] = useState(false)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const [cursorIndex, setCursorIndex] = useState(0)
  const [loadingMailboxes, setLoadingMailboxes] = useState(true)
  const [loading, setLoading] = useState(false)
  const [loadingEmail, setLoadingEmail] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)
  const scrollTopRef = useRef<number>(0)
  const isDraggingRef = useRef(false)
  const startYRef = useRef(0)
  const scrollStartRef = useRef(0)
  const INITIAL_LOAD_COUNT = 20

  // [Cập nhật] Hook xử lý search query
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get('q');

  useEffect(() => {
    try {
      localStorage.setItem('email_previews_map', JSON.stringify(previewsMap))
    } catch (e) {
      console.error('Failed to save email state:', e)
    }
  }, [previewsMap])

  // [Cập nhật] Logic xử lý khi có search query
  useEffect(() => {
    if (searchQuery) {
      handleSearch(searchQuery);
    }
  }, [searchQuery]);

  // [Cập nhật] Hàm thực hiện tìm kiếm
  async function handleSearch(query: string) {
    setLoading(true);
    try {
      // Gọi API tìm kiếm
      const results = await mailApi.searchEmails(query);
      
      // Lưu kết quả vào một folder ảo tên là 'search_results'
      setPreviewsMap((prev) => ({
        ...prev,
        'search_results': results || []
      }));
      
      // Chuyển view sang folder kết quả tìm kiếm
      setSelectedFolder('search_results');
      setSelectedEmail(null);
      setViewMode('list'); // Yêu cầu hiển thị list dọc cho kết quả search
      setMobileView('list');
      
    } catch (e) {
      console.error("Search failed", e);
    } finally {
      setLoading(false);
    }
  }

  // [Cập nhật] Hàm xóa tìm kiếm và quay về Inbox
  function clearSearch() {
    setSearchParams({}); // Xóa query param trên URL
    selectFolder('inbox');
  }

  const displayList = useMemo(() => {
    return previewsMap[selectedFolder] || []
  }, [previewsMap, selectedFolder])

  useEffect(() => {
    if (loadingMore === false && scrollTopRef.current > 0 && listRef.current) {
      setTimeout(() => {
        if (listRef.current && scrollTopRef.current > 0) {
          listRef.current.scrollTop = scrollTopRef.current
          scrollTopRef.current = 0
        }
      }, 0)
    }
  }, [loadingMore, displayList.length])

  const unreadInboxCount = useMemo(() => {
    const inboxPreviews = previewsMap['inbox'] || []
    return inboxPreviews.filter((e: any) => e.unread === true).length
  }, [previewsMap])

  function selectFolder(id: string) {
    // [Cập nhật] Xóa search params khi người dùng chuyển folder thủ công
    if (id !== 'search_results') {
      setSearchParams({});
    }

    setSelectedFolder(id)
    setSelectedEmail(null)
    setSelectedIds({})
    setCursorIndex(0)
    setMobileView('list')
    
    // Không load lại nếu là folder search_results (vì dữ liệu lấy từ API search)
    if (id !== 'search_results' && (!loadedFolders.has(id) || foldersNeedReload.has(id))) {
      loadFolderData(id, true)
    }
  }

  async function loadFolderData(folderId: string, isInitial: boolean = false) {
    if (folderId === 'search_results') return; // Bỏ qua nếu là search results

    if (isInitial) {
      setLoading(true)
    } else {
      setLoadingMore(true)
      if (listRef.current) {
        scrollTopRef.current = listRef.current.scrollTop
      }
    }
    
    try {
      const pageToken = isInitial ? null : pageTokenMap[folderId]
      const res = await mailApi.listEmails(folderId, INITIAL_LOAD_COUNT, pageToken || undefined)
      const previews = (res && res.previews) ? res.previews : (res && res.threads ? res.threads : [])
      const nextPageToken = res?.next_page_token || res?.nextPageToken
      
      setPreviewsMap((prev) => ({
        ...prev,
        [folderId]: isInitial ? previews : [...(prev[folderId] || []), ...previews]
      }))
      
      setPageTokenMap((prev) => ({
        ...prev,
        [folderId]: nextPageToken || null
      }))
      
      setHasMoreMap((prev) => ({
        ...prev,
        [folderId]: !!nextPageToken
      }))
      
      setLoadedFolders((prev) => new Set([...prev, folderId]))
      setFoldersNeedReload((prev) => {
        const updated = new Set(prev)
        updated.delete(folderId)
        return updated
      })
    } catch (e) {
      console.error(`Error loading folder ${folderId}:`, e)
    } finally {
      if (isInitial) {
        setLoading(false)
      } else {
        setLoadingMore(false)
      }
    }
  }

  function loadMoreEmails() {
    // Không load more cho search results (trừ khi API search hỗ trợ phân trang)
    if (selectedFolder === 'search_results') return;

    const hasMore = hasMoreMap[selectedFolder]
    if (hasMore && !loadingMore) {
      loadFolderData(selectedFolder, false)
    }
  }

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget
    const scrollPosition = target.scrollTop + target.clientHeight
    const scrollHeight = target.scrollHeight
    
    if (scrollPosition >= scrollHeight * 0.8 && !loadingMore && !loading) {
      const hasMore = hasMoreMap[selectedFolder]
      if (hasMore) {
        loadMoreEmails()
      }
    }
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!listRef.current) return
    isDraggingRef.current = true
    startYRef.current = e.clientY
    scrollStartRef.current = listRef.current.scrollTop
    listRef.current.style.cursor = 'grabbing'
    listRef.current.style.userSelect = 'none'
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !listRef.current) return
    const deltaY = Math.abs(startYRef.current - e.clientY)
    if (deltaY > 5) {
      e.preventDefault()
      e.stopPropagation()
      const scrollDelta = startYRef.current - e.clientY
      listRef.current.scrollTop = scrollStartRef.current + scrollDelta
    }
  }

  const handleMouseUp = () => {
    if (!listRef.current) return
    isDraggingRef.current = false
    listRef.current.style.cursor = 'default'
    listRef.current.style.userSelect = 'auto'
  }

  const handleMouseLeave = () => {
    if (!listRef.current) return
    isDraggingRef.current = false
    listRef.current.style.cursor = 'default'
    listRef.current.style.userSelect = 'auto'
  }

  async function loadMailboxes() {
    setLoadingMailboxes(true)
    try {
      const data = await mailApi.listMailboxes()
      const filtered = (data || []).filter((box: any) => {
        const idUpper = String(box.id).toUpperCase()
        const nameUpper = String(box.name || '').toUpperCase()

        const isSystem = ['INBOX', 'STARRED', 'SENT', 'DRAFT', 'TRASH'].includes(idUpper) || ['INBOX', 'STARRED', 'SENT', 'DRAFT', 'TRASH'].includes(nameUpper)
        const isSnoozed = idUpper === 'SNOOZED' || nameUpper === 'SNOOZED'
        const isTodo = idUpper === 'TODO' || nameUpper === 'TODO' || nameUpper === 'TO DO'
        const isDone = idUpper === 'DONE' || nameUpper === 'DONE'

        return isSystem || isSnoozed || isTodo || isDone
      }).map((box: any) => {
        const idUpper = String(box.id).toUpperCase()
        const nameUpper = String(box.name || '').toUpperCase()
        let displayName = LABEL_NAME_MAP[idUpper] || box.name
        let normalizedId = String(box.id).toLowerCase()
        
        // Normalize IDs and display names for custom labels
        if (nameUpper === 'TODO' || nameUpper === 'TO DO') {
          normalizedId = 'todo'
          displayName = 'Todo'
        } else if (nameUpper === 'DONE') {
          normalizedId = 'done'
          displayName = 'Done'
        } else if (nameUpper === 'SNOOZED') {
          normalizedId = 'snoozed'
          displayName = 'Snoozed'
        }
        
        return {
          ...box,
          id: normalizedId,
          name: displayName,
          unreadCount: box.unread_count || 0
        }
      })
      setMailboxes(filtered.length > 0 ? filtered : [])
      setLoadingMailboxes(false)
      
      // Nếu có query search thì không load inbox mặc định để tránh ghi đè UI
      if (!searchQuery) {
        const inboxId = 'inbox'
        await loadFolderData(inboxId, true)
      }
    } catch (e) {
      console.error('Error loading mailboxes:', e)
      setMailboxes([])
      setLoadingMailboxes(false)
    }
  }

  async function openEmail(email: any) {
    setLoadingEmail(true)
    try {
      const data = await mailApi.getEmail(email.id)
      const message = data.latest || data.messages?.[0] || data
      const senderStr = typeof message.sender === 'string' 
        ? message.sender 
        : (message.sender?.name || message.sender?.email || 'Unknown')
      
      const actualMessageId = message.id || message.message_id || email.id
      
      setSelectedEmail({
        ...message,
        id: email.id, 
        messageId: actualMessageId, 
        sender: senderStr,
        body: message.processed_html || message.body || message.decoded_body || '',
        subject: message.subject || message.title || '(No Subject)',
        to: message.to || [],
        cc: message.cc || [],
        attachments: message.attachments || []
      })
      
      if (email.unread) {
        try {
          await mailApi.modifyEmail(email.id, { unread: false })
        } catch (e) {
          console.error('Failed to mark email as read on backend:', e)
        }
      }
    } catch (err) {
      console.error('Error loading email:', err)
      const senderStr = typeof email.sender === 'string'
        ? email.sender
        : (email.sender?.name || email.sender?.email || 'Unknown')
      setSelectedEmail({
        ...email,
        sender: senderStr,
        body: email.body || email.preview || '',
        to: []
      })
    } finally {
      setLoadingEmail(false)
    }
    
    setPreviewsMap((prev) => {
      const updated = { ...prev }
      Object.keys(updated).forEach(folder => {
        updated[folder] = updated[folder].map((e: any) => 
          e.id === email.id ? { ...e, unread: false, read: true } : e
        )
      })
      return updated
    })
    
    if (selectedFolder === 'drafts' || (email.labels && email.labels.includes('drafts'))) {
      setComposeTo(email.to?.[0]?.email || '')
      setComposeSubject(email.subject || '')
      setComposeBody(email.body || email.preview || '')
      setShowCompose(true)
      
      setPreviewsMap((prev) => ({
        ...prev,
        drafts: (prev['drafts'] || []).filter((e: any) => e.id !== email.id)
      }))
      
      return 
    }
    
    setMobileView('detail')
  }

  function toggleSelect(id: string) {
    setSelectedIds((s) => ({ ...s, [id]: !s[id] }))
  }

  function selectAllToggle() {
    const allSelected = displayList.length > 0 && displayList.every((e) => selectedIds[e.id])
    if (allSelected) setSelectedIds({})
    else setSelectedIds(Object.fromEntries(displayList.map((e) => [e.id, true])))
  }

  async function deleteSelected() {
    const ids = new Set(Object.keys(selectedIds).filter((k) => selectedIds[k]))
    if (ids.size === 0) return
    
    if (selectedFolder === 'trash') {
      setPreviewsMap((prev) => {
        const updated = { ...prev }
        Object.keys(updated).forEach(folder => {
          updated[folder] = updated[folder].filter((e: any) => !ids.has(String(e.id)))
        })
        return updated
      })
      
      if (selectedEmail && ids.has(String(selectedEmail.id))) setSelectedEmail(null)
      setSelectedIds({})
      return
    }
    
    const promises = Array.from(ids).map(id => 
      mailApi.modifyEmail(id, { trash: true })
        .catch(err => console.error(`Failed to delete email ${id}:`, err))
    )
    
    Promise.all(promises).catch(() => {})
    
    setPreviewsMap((prev) => {
      const updated = { ...prev }
      const movedEmails: any[] = []
      
      Object.keys(updated).forEach(folder => {
        const emails = updated[folder]
        const remaining: any[] = []
        emails.forEach((e: any) => {
          if (ids.has(String(e.id))) {
            movedEmails.push({ ...e, labels: ['trash'] })
          } else {
            remaining.push(e)
          }
        })
        updated[folder] = remaining
      })
      
      updated['trash'] = [...(updated['trash'] || []), ...movedEmails]
      
      return updated
    })
    
    if (selectedEmail && ids.has(String(selectedEmail.id))) setSelectedEmail(null)
    setSelectedIds({})
  }

  async function downloadAttachment(attachment: any) {
    if (!selectedEmail) return
    
    const attachmentId = attachment.attachment_id || attachment.attachmentId
    
    if (!attachmentId) {
      alert('Cannot download attachment: ID is missing. Please try refreshing the email.')
      return
    }
    
    const messageId = attachment.messageId || attachment.message_id || selectedEmail.messageId || selectedEmail.id
    
    if (!messageId) {
      alert('Cannot download attachment: Message ID is missing. Please try refreshing the email.')
      return
    }
    
    try {
      const blob = await mailApi.downloadAttachment(messageId, attachmentId)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = attachment.filename || attachment.name || 'attachment'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to download attachment:', error)
      alert('Failed to download attachment. Please try again.')
    }
  }

  function deleteCurrentEmail() {
    if (!selectedEmail) return
    
    const emailId = String(selectedEmail.id)
    
    if (selectedFolder === 'trash') {
      setPreviewsMap((prev) => {
        const updated = { ...prev }
        Object.keys(updated).forEach(folder => {
          updated[folder] = updated[folder].filter((e: any) => String(e.id) !== emailId)
        })
        return updated
      })
      
      setSelectedEmail(null)
      setMobileView('list')
      return
    }
    
    try {
      mailApi.modifyEmail(emailId, { labels: ['trash'] }).catch(() => {})
    } catch (e) {}
    
    setPreviewsMap((prev) => {
      const updated = { ...prev }
      const movedEmails: any[] = []
      
      Object.keys(updated).forEach(folder => {
        const emails = updated[folder] || []
        const remaining: any[] = []
        emails.forEach((e: any) => {
          if (String(e.id) === emailId) {
            movedEmails.push({ ...e, labels: ['trash'] })
          } else {
            remaining.push(e)
          }
        })
        updated[folder] = remaining
      })
      
      updated['trash'] = [...(updated['trash'] || []), ...movedEmails]
      
      return updated
    })
    
    setSelectedEmail(null)
    setMobileView('list')
  }

  async function markReadUnread(makeRead: boolean) {
    const ids = new Set(Object.keys(selectedIds).filter((k) => selectedIds[k]))
    if (ids.size === 0) return
    
    const promises = Array.from(ids).map(id => 
      mailApi.modifyEmail(id, { unread: !makeRead })
        .catch(err => console.error(`Failed to mark email ${id} as ${makeRead ? 'read' : 'unread'}:`, err))
    )
    
    Promise.all(promises).catch(() => {})
    
    setPreviewsMap((prev) => {
      const updated = { ...prev }
      Object.keys(updated).forEach(folder => {
        updated[folder] = updated[folder].map((e: any) => 
          ids.has(String(e.id)) ? { ...e, unread: !makeRead, read: makeRead } : e
        )
      })
      return updated
    })
    
    setSelectedIds({})
  }
  
  async function toggleStar(email: any) {
    const hasStar = (email.labels || []).includes('starred') || (email.labels || []).includes('STARRED')
    
    try {
      await mailApi.modifyEmail(email.id, { starred: !hasStar })
      if (selectedFolder !== 'search_results') {
          await refreshFolder()
      } else {
          // Nếu đang ở search results, cập nhật state local
          setPreviewsMap((prev) => ({
             ...prev,
             search_results: (prev['search_results'] || []).map(e => 
                 e.id === email.id ? { ...e, labels: hasStar ? [] : ['starred'] } : e // Simplification
             )
          }));
      }
    } catch (e) {
      console.error('Failed to toggle star on backend:', e)
      alert('Failed to update star status')
    }
  }
  
  async function refreshFolder() {
    if (selectedFolder === 'search_results') {
        if (searchQuery) handleSearch(searchQuery);
        return;
    }
    setSelectedEmail(null)
    setSelectedIds({})
    setMobileView('list')
    setPageTokenMap((prev) => ({
      ...prev,
      [selectedFolder]: null
    }))
    await loadFolderData(selectedFolder, true)
  }

  const [composeTo, setComposeTo] = useState('')
  const [composeCc, setComposeCc] = useState('')
  const [composeBcc, setComposeBcc] = useState('')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [composeAttachments, setComposeAttachments] = useState<File[]>([])
  const [showCcBcc, setShowCcBcc] = useState(false)
  
  const [showReply, setShowReply] = useState(false)
  const [replyTo, setReplyTo] = useState('')
  const [replySubject, setReplySubject] = useState('')
  const [replyBody, setReplyBody] = useState('')
  const [replyAttachments, setReplyAttachments] = useState<File[]>([])
  const [replyingToId, setReplyingToId] = useState<string | null>(null)

  function handleReply(email: any) {
    const senderEmail = typeof email.sender === 'string' 
      ? email.sender 
      : (email.sender?.email || 'unknown@example.com')
    
    setReplyTo(senderEmail)
    setReplySubject(email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject || '(no subject)'}`)
    setReplyBody(`\n\n--- Original Message ---\nFrom: ${email.sender}\nSubject: ${email.subject || '(no subject)'}\n\n`)
    setReplyingToId(email.id)
    setShowReply(true)
  }

  async function handleCloseReply() {
    if (replyBody && replyBody.trim()) {
      const saveToDraft = confirm('Save this reply to drafts before closing?')
      if (saveToDraft) {
        try {
          await mailApi.createDraft({
            to: replyTo,
            subject: replySubject || '(no subject)',
            body: replyBody,
            attachments: replyAttachments.length > 0 ? replyAttachments : undefined
          })

          setShowReply(false)
          setReplyTo('')
          setReplySubject('')
          setReplyBody('')
          setReplyAttachments([])
          setReplyingToId(null)

          alert('Draft saved successfully!')
          await refreshFolder()
        } catch (e: any) {
          alert(`Failed to save draft: ${e.response?.data?.detail || e.message || 'Unknown error'}`)
          return
        }
      }
    }
    setShowReply(false)
    setReplyTo('')
    setReplySubject('')
    setReplyBody('')
    setReplyAttachments([])
    setReplyingToId(null)
  }

  async function sendReply() {
    if (!replyTo || !replyTo.trim()) {
      alert('Please enter a recipient email address')
      return
    }
    
    if (!replyingToId) {
      alert('Error: Original email ID is missing')
      return
    }
    
    try {
      await mailApi.replyEmail(replyingToId, {
        to: replyTo,
        subject: replySubject || '(no subject)',
        body: replyBody,
        attachments: replyAttachments.length > 0 ? replyAttachments : undefined
      })
      
      setShowReply(false)
      setReplyTo('')
      setReplySubject('')
      setReplyBody('')
      setReplyAttachments([])
      setReplyingToId(null)

      alert('Reply sent successfully!')
      
      await refreshFolder()
      
    } catch (e: any) {
      alert(`Failed to send reply: ${e.response?.data?.detail || e.message || 'Unknown error'}`)
    }
  }

  async function handleCloseCompose() {
    if (composeTo || composeCc || composeBcc || composeSubject || composeBody || composeAttachments.length > 0) {
      const saveToDraft = confirm('Save this email to drafts before closing?')
      if (saveToDraft) {
        try {
          await mailApi.createDraft({
            to: composeTo,
            cc: composeCc || undefined,
            bcc: composeBcc || undefined,
            subject: composeSubject || '(no subject)',
            body: composeBody,
            attachments: composeAttachments.length > 0 ? composeAttachments : undefined
          })
          
          setShowCompose(false)
          setComposeTo('')
          setComposeCc('')
          setComposeBcc('')
          setComposeSubject('')
          setComposeBody('')
          setComposeAttachments([])
          setShowCcBcc(false)

          alert('Draft saved successfully!')
          await refreshFolder()
        } catch (e: any) {
          alert(`Failed to save draft: ${e.response?.data?.detail || e.message || 'Unknown error'}`)
          return
        }
      }
    }
    
    setShowCompose(false)
    setComposeTo('')
    setComposeCc('')
    setComposeBcc('')
    setComposeSubject('')
    setComposeBody('')
    setComposeAttachments([])
    setShowCcBcc(false)
  }

  async function sendCompose() {
    if (!composeTo || !composeTo.trim()) {
      alert('Please enter a recipient email address')
      return
    }
    
    try {
      await mailApi.sendEmail({ 
        to: composeTo, 
        cc: composeCc || undefined,
        bcc: composeBcc || undefined,
        subject: composeSubject || '(no subject)', 
        body: composeBody,
        attachments: composeAttachments.length > 0 ? composeAttachments : undefined
      })
      
      setShowCompose(false)
      setComposeTo('')
      setComposeCc('')
      setComposeBcc('')
      setComposeSubject('')
      setComposeBody('')
      setComposeAttachments([])
      setShowCcBcc(false)
      
      alert('Email sent successfully!')
      await refreshFolder()
      
    } catch (e: any) {
      alert(`Failed to send email: ${e.response?.data?.detail || e.message || 'Unknown error'}`)
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (mobileView === 'detail') return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setCursorIndex((i) => Math.min(i + 1, displayList.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setCursorIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        const email = displayList[cursorIndex]
        if (email) openEmail(email)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [displayList, cursorIndex, mobileView])

  useEffect(() => {
    const id = displayList[cursorIndex]?.id
    if (!id) return
    const el = document.getElementById(`email-row-${id}`)
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [cursorIndex, displayList])

  const hasLoadedRef = useRef(false)
  
  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true
      loadMailboxes()
    }
  }, [])

  // ------ Render Component Content Helper ------
  const renderEmailDetail = () => {
    if (!selectedEmail) return null;
    return (
      <Card className="email-detail-card h-100">
        <Card.Header className="d-flex align-items-center">
          <div className="me-2">
            <Button variant="outline-secondary" size="sm" onClick={() => handleReply(selectedEmail)}>
              <FaReply />
            </Button>
            <Button variant="outline-secondary" size="sm" className="ms-1" onClick={() => { /* forward mock */ }}>
              <FaForward />
            </Button>
          </div>
          <div className="ms-auto d-flex align-items-center">
            {/* Back button logic: clears selectedEmail, returning to list or board */}
            <Button variant="outline-secondary" size="sm" onClick={() => { setSelectedEmail(null); setMobileView('list') }} className="me-2">
              Back
            </Button>
            <Button variant="outline-danger" size="sm" onClick={deleteCurrentEmail}>
              <FaTrash />
            </Button>
          </div>
        </Card.Header>
        <Card.Body className="d-flex flex-column" style={{ overflowY: 'auto' }}>
          <Card.Title>{selectedEmail.subject}</Card.Title>
          <Card.Subtitle className="mb-2 text-muted">
            <div><strong>From:</strong> {selectedEmail.sender}</div>
            {selectedEmail.to && selectedEmail.to.length > 0 && (
              <div><strong>To:</strong> {selectedEmail.to.map((t: any) => t.name || t.email).join(', ')}</div>
            )}
            {selectedEmail.cc && selectedEmail.cc.length > 0 && (
              <div><strong>Cc:</strong> {selectedEmail.cc.map((c: any) => c.name || c.email).join(', ')}</div>
            )}
          </Card.Subtitle>
          <hr />
          <div className="email-body-container flex-grow-1">
            <iframe
              ref={(iframe) => {
                if (iframe) {
                  const resizeIframe = () => {
                    try {
                      const doc = iframe.contentDocument || iframe.contentWindow?.document
                      if (doc && doc.body) {
                        const height = doc.body.scrollHeight
                        iframe.style.height = Math.max(height + 32, 300) + 'px'
                      }
                    } catch (e) {}
                  }
                  iframe.onload = resizeIframe
                  setTimeout(resizeIframe, 100)
                }
              }}
              srcDoc={`
                <!DOCTYPE html>
                <html>
                  <head>
                    <meta charset="utf-8">
                    <style>
                      body {
                        margin: 0;
                        padding: 16px;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
                        font-size: 14px;
                        line-height: 1.5;
                        color: #333;
                        background: transparent;
                        word-wrap: break-word;
                        overflow-wrap: break-word;
                      }
                      img { max-width: 100%; height: auto; }
                      a { color: #0066cc; }
                      pre { white-space: pre-wrap; }
                      table { border-collapse: collapse; }
                    </style>
                  </head>
                  <body>${selectedEmail.body}</body>
                </html>
              `}
              style={{
                width: '100%',
                minHeight: '300px',
                border: 'none',
                backgroundColor: 'white',
                display: 'block'
              }}
              sandbox="allow-same-origin"
              title="Email content"
            />
          </div>

          {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
            <div className="attachments mt-3">
              <h6>Attachments ({selectedEmail.attachments.length})</h6>
              <div className="d-flex flex-wrap gap-2">
                {selectedEmail.attachments.map((a: any, i: number) => (
                  <Button
                    key={i}
                    variant="outline-primary"
                    size="sm"
                    onClick={() => downloadAttachment(a)}
                    className="d-flex align-items-center"
                  >
                    <FaDownload className="me-2" />
                    {a.filename || a.name}
                    <small className="ms-2 text-muted">({Math.round((a.size || 0) / 1024)} KB)</small>
                  </Button>
                ))}
              </div>
            </div>
          )}
        </Card.Body>
      </Card>
    );
  };
  // ---------------------------------------------

  return (
    <Container fluid className="dashboard-section">
      <Particle />
      <Container className="dashboard-container">
        <Row className="dashboard-row">
          <Col md={2} className={`folder-column ${mobileView === 'detail' ? 'hide-on-mobile' : ''}`}>
            <div className="folders-header pt-3">
              <h5>Mailboxes</h5>
            </div>

            <ListGroup variant="flush" className="folders-list">
              {loadingMailboxes ? (
                <div className="text-center p-3">
                  <FaSync className="fa-spin" /> Loading...
                </div>
              ) : (
                mailboxes.map((f: any) => (
                  <ListGroup.Item key={f.id} action active={f.id === selectedFolder} onClick={() => selectFolder(f.id)}>
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        {String(f.id).toLowerCase() === 'inbox' && <FaInbox className="me-2" />}
                        {String(f.id).toLowerCase() === 'starred' && <FaStar className="me-2" />}
                        {String(f.id).toLowerCase() === 'sent' && <FaPaperPlane className="me-2" />}
                        {String(f.id).toLowerCase() === 'draft' && <FaPen className="me-2" />}
                        {String(f.id).toLowerCase() === 'archive' && <FaFileArchive className="me-2" />}
                        {String(f.id).toLowerCase() === 'trash' && <FaTrash className="me-2" />}
                        {(String(f.id).toLowerCase() === 'todo' || String(f.name || '').toLowerCase() === 'to do') && <FaTasks className="me-2" />}
                        {(String(f.id).toLowerCase() === 'snoozed' || String(f.name || '').toLowerCase() === 'snoozed') && <FaClock className="me-2" />}
                        {String(f.id).toLowerCase() === 'done' && <FaCheckSquare className="me-2" />}
                        {String(f.id).toLowerCase() === 'todo' || String(f.name || '').toLowerCase() === 'to do'
                          ? 'Todo'
                          : f.name}
                      </div>
                      {String(f.id).toLowerCase() === 'inbox' && unreadInboxCount > 0 && (
                        <Badge bg="danger">{unreadInboxCount}</Badge>
                      )}
                    </div>
                  </ListGroup.Item>
                ))
              )}
               {/* [Cập nhật] Hiển thị mục Search Results nếu đang active */}
               {selectedFolder === 'search_results' && (
                 <ListGroup.Item action active className="border-top mt-2">
                    <div className="d-flex justify-content-between align-items-center">
                      <div><FaInbox className="me-2" /> Search Results</div>
                      <Button variant="link" className="p-0 text-white" onClick={clearSearch}>
                        <AiOutlineClose />
                      </Button>
                    </div>
                 </ListGroup.Item>
              )}
            </ListGroup>
          </Col>

          {/* Logic Render View (Kanban vs List) */}
          {viewMode === 'kanban' ? (
            <Col md={10} className="h-100 d-flex flex-column">
              {/* Nếu đã chọn email thì hiển thị chi tiết email, ngược lại hiển thị Board */}
              {selectedEmail ? (
                 <div className="h-100 p-3" style={{ overflow: 'hidden' }}>
                    {renderEmailDetail()}
                 </div>
              ) : (
                <>
                  <div className="email-list-actions d-flex align-items-center justify-content-between mb-2">
                    <h5 className="m-0 text-white">Project Board</h5>
                    <Button 
                      variant="outline-info" 
                      onClick={() => setViewMode('list')}
                      className="d-flex align-items-center gap-2"
                    >
                      <BsListUl /> Back to List
                    </Button>
                  </div>
                  <div className="flex-grow-1" style={{ overflow: 'auto', height: '100%' }}>
                    <KanbanBoard onOpenEmail={(email) => openEmail(email)} />
                  </div>
                </>
              )}
            </Col>
          ) : (
            <>
          <Col md={4} className={`email-list-column ${mobileView === 'detail' ? 'hide-on-mobile' : ''}`}>
             {/* [Cập nhật] Header cho trang kết quả tìm kiếm */}
             {selectedFolder === 'search_results' && (
                <div className="alert alert-info py-2 px-3 mb-2 d-flex justify-content-between align-items-center">
                   <small className="text-truncate" style={{maxWidth: '200px'}}>Results for: <strong>{searchQuery}</strong></small>
                   <Button variant="outline-info" size="sm" onClick={clearSearch}>Clear</Button>
                </div>
              )}

            <div className="email-list-actions d-flex align-items-center mb-2 gap-2">
              <OverlayTrigger placement="bottom" overlay={<Tooltip>Switch View</Tooltip>}>
                <Button 
                  variant="outline-info" 
                  className="me"
                  onClick={() => setViewMode(viewMode === 'list' ? 'kanban' : 'list')}
                  disabled={selectedFolder === 'search_results'} // Không cho switch kanban khi search
                >
                  {viewMode === 'list' ? <BsKanban /> : <BsListUl />}
                </Button>
              </OverlayTrigger>
              <OverlayTrigger placement="bottom" overlay={<Tooltip>Compose</Tooltip>}>
                <Button variant="primary" onClick={() => setShowCompose(true)} aria-label="Compose">
                  <BiEdit />
                </Button>
              </OverlayTrigger>
              <OverlayTrigger placement="bottom" overlay={<Tooltip>Refresh</Tooltip>}>
                <Button variant="light" onClick={refreshFolder} aria-label="Refresh">
                  <FaSync />
                </Button>
              </OverlayTrigger>
              <OverlayTrigger placement="bottom" overlay={<Tooltip>Select All</Tooltip>}>
                <Button variant="outline-secondary" onClick={selectAllToggle} aria-label="Select all">
                  <FaCheckSquare />
                </Button>
              </OverlayTrigger>
              <OverlayTrigger placement="bottom" overlay={<Tooltip>Delete</Tooltip>}>
                <Button variant="outline-danger" onClick={deleteSelected} aria-label="Delete selected">
                  <FaTrash />
                </Button>
              </OverlayTrigger>
              <OverlayTrigger placement="bottom" overlay={<Tooltip>Mark as Read</Tooltip>}>
                <Button variant="outline-secondary" onClick={() => markReadUnread(true)} aria-label="Mark read">
                  <FaEnvelopeOpen />
                </Button>
              </OverlayTrigger>
              <OverlayTrigger placement="bottom" overlay={<Tooltip>Mark as Unread</Tooltip>}>
                <Button variant="outline-secondary" onClick={() => markReadUnread(false)} aria-label="Mark unread">
                  <FaEnvelope />
                </Button>
              </OverlayTrigger>
            </div>

            <div 
              className="email-list" 
              ref={listRef} 
              onScroll={handleScroll}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
            >
              {loading ? (
                <div className="text-center p-5">
                  <FaSync className="fa-spin" size={32} />
                  <p className="mt-3">Loading emails...</p>
                </div>
              ) : (
              <>
                {/* [Cập nhật] Hiển thị thông báo khi không có kết quả tìm kiếm */}
                {displayList.length === 0 && selectedFolder === 'search_results' ? (
                    <div className="text-center p-4 text-muted">
                      <p>No results found for "{searchQuery}"</p>
                      <Button variant="link" onClick={clearSearch}>Return to Inbox</Button>
                    </div>
                ) : (
                  <ListGroup variant="flush">
                    {displayList.map((email: any, idx: number) => {
                      const id = email.id
                      const isRead = ('read' in email) ? !!email.read : (email.unread === false)
                      const sender = (email.sender && (email.sender.name || email.sender.email)) ? (email.sender.name || email.sender.email) : (email.sender || '')
                      const subject = email.subject || ''
                      const preview = email.body || email.preview || ''
                      const ts = email.timestamp || (email.receivedOn ? Date.parse(email.receivedOn) : Date.now())
                      const isStarred = ((email.labels || email.tags) || []).includes('starred')
                      return (
                        <ListGroup.Item
                          id={`email-row-${id}`}
                          key={id}
                          action
                          className={`email-row d-flex align-items-start ${isRead ? 'read' : 'unread'} ${cursorIndex === idx ? 'cursor' : ''}`}
                          onClick={(e) => {
                            if (isDraggingRef.current && Math.abs(startYRef.current - e.clientY) > 5) {
                              return
                            }
                            setCursorIndex(idx)
                            openEmail(email)
                          }}
                        >
                          <div className="checkbox-col me-2" onClick={(e) => e.stopPropagation()}>
                            <Form.Check type="checkbox" checked={!!selectedIds[id]} onChange={() => toggleSelect(id)} />
                          </div>
                          <div className="star-col me-2" onClick={(e) => { e.stopPropagation(); toggleStar(email) }}>
                            {isStarred ? <FaStar /> : <FaRegStar />}
                          </div>
                          <div className="meta-col flex-fill">
                            <div className="row-top d-flex justify-content-between">
                              <div className="sender">{sender}</div>
                              <div className="time">{timeAgo(ts)}</div>
                            </div>
                            <div className="subject">{subject}</div>
                            <div className="preview">{preview}</div>
                          </div>
                        </ListGroup.Item>
                      )
                    })}
                  </ListGroup>
                )}
                
                {loadingMore && (
                  <div className="text-center p-3">
                    <FaSync className="fa-spin" size={20} />
                    <small className="ms-2">Loading more...</small>
                  </div>
                )}
                {!loadingMore && hasMoreMap[selectedFolder] && selectedFolder !== 'search_results' && (
                  <div className="text-center p-3">
                    <small className="text-muted">Scroll down for more emails</small>
                  </div>
                )}
              </>
              )}
            </div>
          </Col>

          <Col md={6} className={`email-detail-column ${mobileView === 'list' ? 'hide-on-mobile' : ''}`}>
            {loadingEmail ? (
              <div className="text-center mt-5">
                <FaSync className="fa-spin" size={48} />
                <p className="mt-3">Loading email...</p>
              </div>
            ) : !selectedEmail ? (
              <div className="empty-state text-center mt-5">
                <FaInbox size={48} />
                <p>Select an email to view details</p>
              </div>
            ) : (
              renderEmailDetail() // Sử dụng lại hàm render
            )}
          </Col>
          </>
          )}
        </Row>
      </Container>

      {/* Modals Compose & Reply (Giữ nguyên) */}
      <Modal show={showCompose} onHide={handleCloseCompose} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Compose</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-2">
              <Form.Label>To</Form.Label>
              <Form.Control value={composeTo} onChange={(e) => setComposeTo(e.target.value)} placeholder="recipient@example.com" />
            </Form.Group>
            
            {!showCcBcc && (
              <div className="mb-2">
                <Button variant="link" size="sm" onClick={() => setShowCcBcc(true)}>+ Add Cc/Bcc</Button>
              </div>
            )}
            
            {showCcBcc && (
              <>
                <Form.Group className="mb-2">
                  <Form.Label>Cc</Form.Label>
                  <Form.Control value={composeCc} onChange={(e) => setComposeCc(e.target.value)} placeholder="Optional" />
                </Form.Group>
                <Form.Group className="mb-2">
                  <Form.Label>Bcc</Form.Label>
                  <Form.Control value={composeBcc} onChange={(e) => setComposeBcc(e.target.value)} placeholder="Optional" />
                </Form.Group>
              </>
            )}
            
            <Form.Group className="mb-2">
              <Form.Label>Subject</Form.Label>
              <Form.Control value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>Body</Form.Label>
              <Form.Control as="textarea" rows={8} value={composeBody} onChange={(e) => setComposeBody(e.target.value)} />
            </Form.Group>
            <Form.Group>
              <Form.Label>Attachments</Form.Label>
              <Form.Control 
                type="file" 
                multiple 
                onChange={(e: any) => {
                  const files = Array.from(e.target.files || [])
                  setComposeAttachments(files as File[])
                }}
              />
              {composeAttachments.length > 0 && (
                <div className="mt-2">
                  <small className="text-muted">
                    {composeAttachments.length} file(s) selected: {composeAttachments.map(f => f.name).join(', ')}
                  </small>
                </div>
              )}
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleCloseCompose}>Cancel</Button>
          <Button variant="primary" onClick={sendCompose}>Send</Button>
        </Modal.Footer>
      </Modal>
      
      <Modal show={showReply} onHide={handleCloseReply} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Reply</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-2">
              <Form.Label>To</Form.Label>
              <Form.Control value={replyTo} onChange={(e) => setReplyTo(e.target.value)} readOnly />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>Subject</Form.Label>
              <Form.Control value={replySubject} onChange={(e) => setReplySubject(e.target.value)} readOnly />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>Body</Form.Label>
              <Form.Control as="textarea" rows={8} value={replyBody} onChange={(e) => setReplyBody(e.target.value)} />
            </Form.Group>
            <Form.Group>
              <Form.Label>Attachments</Form.Label>
              <Form.Control 
                type="file" 
                multiple 
                onChange={(e: any) => {
                  const files = Array.from(e.target.files || [])
                  setReplyAttachments(files as File[])
                }}
              />
              {replyAttachments.length > 0 && (
                <div className="mt-2">
                  <small className="text-muted">
                    {replyAttachments.length} file(s) selected: {replyAttachments.map(f => f.name).join(', ')}
                  </small>
                </div>
              )}
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleCloseReply}>Cancel</Button>
          <Button variant="primary" onClick={sendReply}>Send Reply</Button>
        </Modal.Footer>
      </Modal>
    </Container>
  )
}