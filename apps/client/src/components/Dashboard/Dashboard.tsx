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
import { getGmailMessageUrl } from '../../utils/gmail'
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
  FaExternalLinkAlt,
  FaDownload,
  FaClock,
  FaTasks,
  FaBan,
  FaExclamationTriangle,
  FaFolder,
} from 'react-icons/fa'
import { BiEdit } from 'react-icons/bi'
import { OverlayTrigger, Tooltip } from 'react-bootstrap'
import { BsKanban, BsListUl } from 'react-icons/bs'; 
import { AiOutlineClose } from 'react-icons/ai'; // [Cập nhật] Icon đóng
import KanbanBoard from './KanbanBoard'; 

import { useSearchParams } from 'react-router-dom';
import { useSearch } from '../../contexts/SearchContext'; // [Cập nhật] Hook lấy query param

// Map Gmail label IDs to friendly names
const LABEL_NAME_MAP: Record<string, string> = {
  'INBOX': 'Inbox',
  'STARRED': 'Starred',
  'SENT': 'Sent',
  'DRAFT': 'Drafts',
  'TRASH': 'Trash',
  'SPAM': 'Spam',
  'IMPORTANT': 'Important',
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
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({})
  
  // Pagination states
  const [currentPageMap, setCurrentPageMap] = useState<Record<string, number>>({})
  const [pageCacheMap, setPageCacheMap] = useState<Record<string, Record<number, any[]>>>({})
  const [totalPagesMap, setTotalPagesMap] = useState<Record<string, number>>({})
  const [_pageTokensMap, setPageTokensMap] = useState<Record<string, Record<number, string | null>>>({})
  const PAGE_SIZE = 20
  const [showCompose, setShowCompose] = useState(false)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const [cursorIndex, setCursorIndex] = useState(0)
  const [loadingMailboxes, setLoadingMailboxes] = useState(true)
  const [_loading, setLoading] = useState(false)
  const [loadingEmail, setLoadingEmail] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadingFolders, setLoadingFolders] = useState<Set<string>>(new Set()) // Track loading state per folder
  const listRef = useRef<HTMLDivElement | null>(null)
  const scrollTopRef = useRef<number>(0)
  const isDraggingRef = useRef(false)
  const startYRef = useRef(0)
  const scrollStartRef = useRef(0)
  const pageCacheRef = useRef<Record<string, Record<number, any[]>>>({})
  const pageTokensRef = useRef<Record<string, Record<number, string | null>>>({})
    
  // Thêm state
  const [filterMode, setFilterMode] = useState<'all' | 'unread' | 'has-attachment'>('all');
  const [sortMode, setSortMode] = useState<'date-desc' | 'date-asc' | 'sender-asc'>('date-desc');
  const [error, setError] = useState<string | null>(null); // Cho F2 Error State
  const [autoSyncAttempted, setAutoSyncAttempted] = useState(false); // Track if auto-sync was attempted
  
  // [Cập nhật] Hook xử lý search query
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get('q');

  const folderParam = searchParams.get('folder') || undefined; // [NEW] read folder from URL

  const { selectedEmail, setSelectedEmail } = useSearch();

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
  async function handleSearch(query: string, skipAutoSync: boolean = false) {
    setLoading(true);
    setError(null); // Reset lỗi cũ
    try {
      console.log('[Search] Calling API with query:', query);
      console.log('[Search] Attempting Semantic Search with query:', query);
      
      // 1. Ưu tiên gọi Semantic Search (Tìm kiếm thông minh)
      let results = await mailApi.searchEmailsSemantic(query);
      
      // 2. [QUAN TRỌNG] Logic Fallback: 
      // Nếu Semantic Search không trả về kết quả nào, ta gọi lại Search cũ (Keyword Search)
      if (!results || (Array.isArray(results) && results.length === 0)) {
          console.log('[Search] Semantic search returned 0 results. Falling back to Standard Keyword Search...');
          results = await mailApi.searchEmails(query);
      }

      console.log('[Search] Final results:', results);
      console.log('[Search] Raw API response:', results);
      console.log('[Search] Is array?', Array.isArray(results));
      console.log('[Search] Length:', results?.length);
      
      // Normalize search results to match preview format
      const normalizedResults = Array.isArray(results) ? results.map((email: any) => ({
        ...email,
        // Convert received_on to timestamp if needed
        timestamp: email.timestamp || (email.receivedOn ? Date.parse(email.receivedOn) : (email.received_on ? Date.parse(email.received_on) : Date.now())),
        // Ensure hasAttachments field exists
        hasAttachments: email.hasAttachments || email.has_attachments || false,
        // Normalize preview/body field
        preview: email.preview || email.body || email.snippet || '',
      })) : [];
      
      console.log('[Search] Normalized results count:', normalizedResults.length);
      console.log('[Search] Normalized results:', normalizedResults);
      
      setPreviewsMap((prev) => ({
        ...prev,
        'search_results': normalizedResults
      }));
      setSelectedFolder('search_results');
      setSelectedEmail(null); // Clear any selected email to prevent random opening
      // Don't force view mode - let user keep their preference
      setMobileView('list');
      
      // Auto-sync if no results and haven't tried syncing yet
      if (normalizedResults.length === 0 && !autoSyncAttempted && !skipAutoSync) {
        console.log('[Search] No results found, attempting auto-sync...');
        setAutoSyncAttempted(true); // Mark that we've attempted sync before starting
        try {
          await mailApi.syncEmailIndex(90, 5);
          console.log('[Search] Auto-sync completed, waiting for index to be ready...');
          // Wait a bit for MongoDB index to commit before re-searching
          await new Promise(resolve => setTimeout(resolve, 2000));
          console.log('[Search] Re-searching...');
          // Re-run search after sync, but skip auto-sync to prevent infinite loop
          // Don't set loading to false yet - keep it true for the re-search
          await handleSearch(query, true);
          return; // Exit early to avoid setting loading to false
        } catch (syncError: any) {
          console.error('[Search] Auto-sync failed:', syncError);
          setError(`No results found. Auto-sync failed: ${syncError.response?.data?.detail || syncError.message}`);
        }
      } else if (normalizedResults.length === 0) {
        console.warn('[Search] No results found for query:', query);
      }
    } catch (e: any) {
      console.error("[Search] Failed:", e);
      console.error("[Search] Error details:", e.response?.data);
      setError(`Failed to search emails: ${e.response?.data?.detail || e.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }

  // [Cập nhật] Hàm xóa tìm kiếm và quay về Inbox
  function clearSearch() {
    setSearchParams({}); // Xóa query param trên URL
    setAutoSyncAttempted(false); // Reset auto-sync flag for next search
    selectFolder('inbox');
  }

  // [Cập nhật] Hàm thực hiện tìm kiếm

  const displayList = useMemo(() => {
    // For paginated view, get only the current page from cache
    const currentPage = currentPageMap[selectedFolder] || 1
    let list = pageCacheMap[selectedFolder]?.[currentPage] || []

    // 1. FILTERING (Lọc)
    if (filterMode === 'unread') {
      list = list.filter((e: any) => e.unread === true)
    } else if (filterMode === 'has-attachment') {
      // Use hasAttachments field like Kanban view
      list = list.filter((e: any) => e.hasAttachments === true)
    }

    // 2. SORTING (Sắp xếp)
    list = [...list].sort((a: any, b: any) => {
      if (sortMode === 'sender-asc') {
        // Sort by sender A-Z like Kanban view
        const senderA = typeof a.sender === 'string' ? a.sender : (a.sender?.name || a.sender?.email || '');
        const senderB = typeof b.sender === 'string' ? b.sender : (b.sender?.name || b.sender?.email || '');
        return senderA.toLowerCase().localeCompare(senderB.toLowerCase());
      } else {
        // Sort by date
        const timeA = a.timestamp || (a.receivedOn ? Date.parse(a.receivedOn) : 0)
        const timeB = b.timestamp || (b.receivedOn ? Date.parse(b.receivedOn) : 0)
        
        if (sortMode === 'date-asc') {
          return timeA - timeB // Cũ nhất trước
        } else {
          return timeB - timeA // Mới nhất trước (Mặc định)
        }
      }
    })

    return list
  }, [pageCacheMap, selectedFolder, currentPageMap, filterMode, sortMode]) // Updated dependencies


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
    // Count unread emails across all cached pages for inbox
    const inboxCache = pageCacheMap['inbox'] || {}
    let unreadCount = 0
    Object.values(inboxCache).forEach((pageData: any[]) => {
      unreadCount += pageData.filter((e: any) => e.unread === true).length
    })
    return unreadCount
  }, [pageCacheMap])

  // [NEW] Sync folder from URL (?folder=...) triggered from Navbar
  useEffect(() => {
    if (folderParam && folderParam !== selectedFolder) {
      selectFolder(folderParam);
    }
  }, [folderParam]); // eslint-disable-line react-hooks/exhaustive-deps

  function selectFolder(id: string) {

    // [CHANGED] Keep URL in sync when switching folder (except search_results)
    if (id !== 'search_results') {
      setSearchParams({ folder: id });
    }

    // Reset all states for clean folder switch
    setSelectedFolder(id)
    setSelectedEmail(null)
    setSelectedIds({})
    setCursorIndex(0)
    setMobileView('list')
    setError(null)
    setLoadingMore(false)

    // Initialize current page to 1 FIRST, before any loading
    setCurrentPageMap(prev => ({ ...prev, [id]: 1 }))

    // Reset scroll position for new folder
    if (listRef.current) {
      listRef.current.scrollTop = 0
      scrollTopRef.current = 0
    }

    if (id !== 'search_results' && (!loadedFolders.has(id) || foldersNeedReload.has(id))) {
      loadFolderData(id, 1)
    }
  }

  async function loadFolderData(folderId: string, pageNum: number) {
    // Check if page is already cached using ref for immediate access
    console.log(`loadFolderData called for ${folderId} page ${pageNum}`)
    console.log(`Current cache:`, pageCacheRef.current)
    const cachedPage = pageCacheRef.current[folderId]?.[pageNum]
    console.log(`Cached page data:`, cachedPage)
    
    if (cachedPage && cachedPage.length > 0) {
      console.log(`✓ Using cached page ${pageNum} for ${folderId}`)
      setCurrentPageMap(prev => ({ ...prev, [folderId]: pageNum }))
      // Pre-fetch next page if not cached
      const nextPage = pageNum + 1
      const nextPageToken = pageTokensRef.current[folderId]?.[pageNum]
      if (nextPageToken && !pageCacheRef.current[folderId]?.[nextPage]) {
        loadPageInBackground(folderId, nextPage, nextPageToken)
      }
      return
    }

    console.log(`✗ Cache miss - loading page ${pageNum} for ${folderId}`)
    // Set current page immediately before loading
    setCurrentPageMap(prev => ({ ...prev, [folderId]: pageNum }))
    setLoadingFolders(prev => new Set([...prev, folderId]))
    
    try {

      // Get page token for this page (null for page 1)
      const pageToken = pageNum === 1 ? null : pageTokensRef.current[folderId]?.[pageNum - 1]
      const res = await mailApi.listEmails(folderId, PAGE_SIZE, pageToken || undefined)
      let previews = (res && res.previews) ? res.previews : (res && res.threads ? res.threads : [])
      
      // --- [ĐOẠN CODE MỚI] ---
      // Nếu đang tải folder 'starred', kiểm tra và đảm bảo mọi email đều có tag STARRED
      if (folderId === 'starred') {
        previews = previews.map((email: any) => {
          const rawTags = email.tags || email.labels || [];
          
          // Kiểm tra xem đã có tag star chưa (xử lý cả string và object)
          const hasStar = Array.isArray(rawTags) && rawTags.some((t: any) => 
            (typeof t === 'string' && (t === 'STARRED' || t === 'starred')) || 
            (typeof t === 'object' && (t.id === 'STARRED' || t.name === 'STARRED'))
          );

          // Nếu chưa có, tự động thêm vào để UI hiển thị đúng (Ngôi sao đặc màu xanh)
          if (!hasStar) {
             const starTag = { id: 'STARRED', name: 'STARRED' };
             // Cập nhật cả tags và labels để an toàn
             const newTags = [...(Array.isArray(rawTags) ? rawTags : []), starTag];
             return { ...email, tags: newTags, labels: newTags };
          }
          return email;
        });
      }
      // -----------------------

      const nextPageToken = res?.next_page_token || res?.nextPageToken
      
      // Cache the page data
      setPageCacheMap((prev) => {
        const updated = {
          ...prev,
          [folderId]: {
            ...(prev[folderId] || {}),
            [pageNum]: previews
          }
        }
        pageCacheRef.current = updated // Update ref
        return updated
      })
      
      // Store the token for the next page
      setPageTokensMap((prev) => {
        const updated = {
          ...prev,
          [folderId]: {
            ...(prev[folderId] || {}),
            [pageNum]: nextPageToken || null
          }
        }
        pageTokensRef.current = updated // Update ref
        return updated
      })
      
      // Update total pages if we know there's more
      if (nextPageToken) {
        setTotalPagesMap((prev) => ({
          ...prev,
          [folderId]: Math.max(prev[folderId] || 0, pageNum + 1)
        }))
      } else {
        // This is the last page
        setTotalPagesMap((prev) => ({
          ...prev,
          [folderId]: pageNum
        }))
      }
      
      setCurrentPageMap(prev => ({ ...prev, [folderId]: pageNum }))
      setLoadedFolders((prev) => new Set([...prev, folderId]))
      setFoldersNeedReload((prev) => {
        const updated = new Set(prev)
        updated.delete(folderId)
        return updated
      })

      // Pre-fetch next page in background if available
      if (nextPageToken) {
        loadPageInBackground(folderId, pageNum + 1, nextPageToken)
      }
    } catch (e: any) {
      console.error(`Error loading folder ${folderId} page ${pageNum}:`, e)
      setError(`Failed to load ${folderId} emails: ${e.message || 'Unknown error'}`)
    } finally {
      setLoadingFolders(prev => {
        const updated = new Set(prev)
        updated.delete(folderId)
        return updated
      })
    }
  }

  async function loadPageInBackground(folderId: string, pageNum: number, pageToken: string) {
    // Don't load if already cached (use ref for immediate check)
    if (pageCacheRef.current[folderId]?.[pageNum]) {
      return
    }

    try {
      console.log(`Pre-fetching page ${pageNum} for ${folderId}`)
      const res = await mailApi.listEmails(folderId, PAGE_SIZE, pageToken)
      const previews = (res && res.previews) ? res.previews : (res && res.threads ? res.threads : [])
      const nextPageToken = res?.next_page_token || res?.nextPageToken
      
      // Cache the page data
      setPageCacheMap((prev) => {
        const updated = {
          ...prev,
          [folderId]: {
            ...(prev[folderId] || {}),
            [pageNum]: previews
          }
        }
        pageCacheRef.current = updated // Update ref
        return updated
      })
      
      // Store the token for the next page
      setPageTokensMap((prev) => {
        const updated = {
          ...prev,
          [folderId]: {
            ...(prev[folderId] || {}),
            [pageNum]: nextPageToken || null
          }
        }
        pageTokensRef.current = updated // Update ref
        return updated
      })

      // Update total pages
      if (nextPageToken) {
        setTotalPagesMap((prev) => ({
          ...prev,
          [folderId]: Math.max(prev[folderId] || 0, pageNum + 1)
        }))
      } else {
        setTotalPagesMap((prev) => ({
          ...prev,
          [folderId]: pageNum
        }))
      }
    } catch (e: any) {
      console.error(`Error pre-fetching page ${pageNum} for ${folderId}:`, e)
    }
  }

  // Helper function to update email in all cache pages
  function updateEmailInCache(emailId: string, updateFn: (email: any) => any) {
    setPageCacheMap((prev) => {
      const updated = { ...prev }
      Object.keys(updated).forEach(folder => {
        const folderCache = updated[folder]
        Object.keys(folderCache).forEach(pageNumStr => {
          const pageNum = parseInt(pageNumStr, 10)
          folderCache[pageNum] = folderCache[pageNum].map((e: any) => 
            e.id === emailId ? updateFn(e) : e
          )
        })
      })
      return updated
    })
  }

  // Helper function to remove email from all cache pages
  function removeEmailFromCache(emailId: string) {
    setPageCacheMap((prev) => {
      const updated = { ...prev }
      Object.keys(updated).forEach(folder => {
        const folderCache = updated[folder]
        Object.keys(folderCache).forEach(pageNumStr => {
          const pageNum = parseInt(pageNumStr, 10)
          folderCache[pageNum] = folderCache[pageNum].filter((e: any) => e.id !== emailId)
        })
      })
      return updated
    })
  }

  // Pagination navigation functions
  function goToNextPage() {
    const currentPage = currentPageMap[selectedFolder] || 1
    const totalPages = totalPagesMap[selectedFolder] || 1
    if (currentPage < totalPages) {
      loadFolderData(selectedFolder, currentPage + 1)
    }
  }

  function goToPreviousPage() {
    const currentPage = currentPageMap[selectedFolder] || 1
    if (currentPage > 1) {
      loadFolderData(selectedFolder, currentPage - 1)
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
      const filtered = (data || []).map((box: any) => {
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

      // Remove duplicates by normalized ID
      const seenIds = new Set()
      const uniqueFiltered = filtered.filter((box: any) => {
        const nameUpper = String(box.name || '').toUpperCase()
        let normalizedId = String(box.id).toLowerCase()

        // Normalize IDs for deduplication
        if (nameUpper === 'TODO' || nameUpper === 'TO DO') {
          normalizedId = 'todo'
        } else if (nameUpper === 'DONE') {
          normalizedId = 'done'
        } else if (nameUpper === 'SNOOZED') {
          normalizedId = 'snoozed'
        }

        if (seenIds.has(normalizedId)) {
          return false
        }
        seenIds.add(normalizedId)
        return true
      })

      setMailboxes(uniqueFiltered.length > 0 ? uniqueFiltered : [])
      setLoadingMailboxes(false)
      
      // [CHANGED] Only auto-load Inbox when no search and no folder param
      if (!searchQuery && !searchParams.get('folder')) {
        const inboxId = 'inbox'
        await loadFolderData(inboxId, 1)
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
      
      // Backend returns camelCase (processedHtml) due to Pydantic alias_generator
      // Check both camelCase and snake_case for compatibility
      const processedHtml = message.processedHtml || message.processed_html || message.body || message.decoded_body || ''
      
      // Log email HTML content for debugging
      
      setSelectedEmail({
        ...message,
        sender: senderStr,
        body: processedHtml,
        subject: message.subject || message.title || '(No Subject)',
        to: message.to || [],
        cc: message.cc || [],
        attachments: message.attachments || [],
        id: email.id,
        messageId: actualMessageId
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
    
    // Update email as read in cache
    updateEmailInCache(email.id, (e: any) => ({ ...e, unread: false, read: true }))
    
    // Also update previewsMap for backwards compatibility
    setPreviewsMap((prev) => {
      const updated = { ...prev }
      Object.keys(updated).forEach(folder => {
        updated[folder] = updated[folder].map((e: any) => 
          e.id === email.id ? { ...e, unread: false, read: true } : e
        )
      })
      return updated
    })
    
    if (selectedFolder === 'drafts' || (email.tags && email.tags.some((tag: any) => tag.id === 'DRAFT'))) {
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
      // Remove from cache
      ids.forEach(id => removeEmailFromCache(id))
      
      // Also update previewsMap for backwards compatibility
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
    
    // Update cache
    setPageCacheMap((prev) => {
      const updated = { ...prev }
      const movedEmails: any[] = []
      
      Object.keys(updated).forEach(folder => {
        const folderCache = updated[folder]
        Object.keys(folderCache || {}).forEach(pageNumStr => {
          const pageNum = parseInt(pageNumStr, 10)
          const emails = folderCache[pageNum]
          const remaining: any[] = []
          emails.forEach((e: any) => {
            if (ids.has(String(e.id))) {
              movedEmails.push({ ...e, labels: ['trash'] })
            } else {
              remaining.push(e)
            }
          })
          folderCache[pageNum] = remaining
        })
      })
      
      // Add to trash cache (page 1)
      if (!updated['trash']) updated['trash'] = {}
      updated['trash'][1] = [...(updated['trash'][1] || []), ...movedEmails]
      
      return updated
    })
    
    // Also update previewsMap for backwards compatibility
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
      removeEmailFromCache(emailId)
      
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

    // Update cache
    setPageCacheMap((prev) => {
      const updated = { ...prev }

      if (selectedFolder === 'drafts' || (selectedEmail.tags && selectedEmail.tags.some((tag: any) => tag.id === 'DRAFT'))) {
        // For draft folder, just remove the email from cache
        if (updated[selectedFolder]) {
          Object.keys(updated[selectedFolder]).forEach(pageNumStr => {
            const pageNum = parseInt(pageNumStr, 10)
            updated[selectedFolder][pageNum] = updated[selectedFolder][pageNum].filter((e: any) => String(e.id) !== emailId)
          })
        }
      } else {
        // For other folders, move to trash
        const movedEmails: any[] = []

        Object.keys(updated).forEach(folder => {
          const folderCache = updated[folder] || {}
          Object.keys(folderCache).forEach(pageNumStr => {
            const pageNum = parseInt(pageNumStr, 10)
            const emails = folderCache[pageNum] || []
            const remaining: any[] = []
            emails.forEach((e: any) => {
              if (String(e.id) === emailId) {
                movedEmails.push({ ...e, labels: ['trash'] })
              } else {
                remaining.push(e)
              }
            })
            folderCache[pageNum] = remaining
          })
        })

        if (!updated['trash']) updated['trash'] = {}
        updated['trash'][1] = [...(updated['trash'][1] || []), ...movedEmails]
      }

      return updated
    })

    // Also update previewsMap for backwards compatibility
    setPreviewsMap((prev) => {
      const updated = { ...prev }

      if (selectedFolder === 'drafts' || (selectedEmail.tags && selectedEmail.tags.some((tag: any) => tag.id === 'DRAFT'))) {
        // For draft folder, just remove the email from UI
        updated[selectedFolder] = (updated[selectedFolder] || []).filter((e: any) => String(e.id) !== emailId)
      } else {
        // For other folders, move to trash
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
      }

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
  
  // Tìm hàm toggleStar cũ và thay thế bằng hàm này
  async function toggleStar(email: any) {
    // 1. Xác định trạng thái hiện tại
    const rawLabels = email.labels || email.tags || [];
    const isStarred = 
      (Array.isArray(rawLabels) && rawLabels.some((l: any) => 
          typeof l === 'string' && (l === 'starred' || l === 'STARRED')
      )) ||
      (Array.isArray(rawLabels) && rawLabels.some((t: any) => 
          typeof t === 'object' && (t.id === 'STARRED' || t.name === 'STARRED' || t.id === 'starred')
      ));

    // 2. OPTIMISTIC UPDATE: Cập nhật trực tiếp vào pageCacheMap (Nguồn dữ liệu của UI)
    setPageCacheMap((prev) => {
      const updated = { ...prev };
      
      // Duyệt qua các folder và page trong cache để cập nhật email
      Object.keys(updated).forEach(folder => {
        const folderCache = updated[folder];
        Object.keys(folderCache).forEach(pageNumStr => {
           const pageNum = parseInt(pageNumStr, 10);
           
           // Nếu đang ở folder 'starred' và hành động là bỏ star -> Xóa khỏi danh sách
           if (selectedFolder === 'starred' && isStarred) {
             folderCache[pageNum] = folderCache[pageNum].filter((e: any) => e.id !== email.id);
           } else {
             // Cập nhật trạng thái label cho email
             folderCache[pageNum] = folderCache[pageNum].map((e: any) => {
               if (e.id === email.id) {
                 let newLabels = e.labels || e.tags || [];
                 if (isStarred) {
                   // Bỏ Star
                   newLabels = Array.isArray(newLabels) ? newLabels.filter((l: any) => {
                     const val = typeof l === 'string' ? l : (l.id || l.name);
                     return val !== 'starred' && val !== 'STARRED';
                   }) : [];
                 } else {
                   // Thêm Star
                   newLabels = [...(Array.isArray(newLabels) ? newLabels : []), 'starred'];
                 }
                 return { ...e, labels: newLabels, tags: newLabels };
               }
               return e;
             });
           }
        });
      });
      return updated;
    });

    // 3. Gọi API (Background sync)
    try {
      await mailApi.modifyEmail(email.id, { starred: !isStarred });
      
      // [QUAN TRỌNG] Đã loại bỏ refreshFolder() ở đây để tránh loading lại trang.
      // Việc cập nhật cache ở bước 2 đã đủ để hiển thị đúng trên giao diện.
      
    } catch (e) {
      console.error('Failed to toggle star on backend:', e);
      // Nếu API lỗi, bạn có thể xem xét revert lại state ở đây (tùy chọn)
      alert('Failed to update star status');
    }
  }
  
  async function refreshFolder() {
    setSelectedEmail(null)
    setSelectedIds({})
    setMobileView('list')
    
    // Clear cache for current folder
    setPageCacheMap((prev) => {
      const updated = { ...prev }
      delete updated[selectedFolder]
      return updated
    })
    
    setPageTokensMap((prev) => {
      const updated = { ...prev }
      delete updated[selectedFolder]
      return updated
    })
    
    setCurrentPageMap(prev => ({ ...prev, [selectedFolder]: 1 }))
    await loadFolderData(selectedFolder, 1)
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
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null)

  function handleReply(email: any) {
    let senderEmail = 'unknown@example.com'
    let senderDisplay = 'Unknown'

    if (typeof email.sender === 'string') {
      senderEmail = email.sender
      senderDisplay = email.sender
    } else if (email.sender?.email) {
      senderEmail = email.sender.email
      senderDisplay = email.sender.name ? `${email.sender.name} <${email.sender.email}>` : email.sender.email
    }

    setReplyTo(senderEmail)
    setReplySubject(email.subject?.startsWith('Re:') ? email.subject : `Re: ${email.subject || '(no subject)'}`)
    setReplyBody(`\n\n--- Original Message ---\nFrom: ${senderDisplay}\nSubject: ${email.subject || '(no subject)'}\n\n`)
    setReplyingToId(email.id)
    setShowReply(true)
  }

  function handleEditDraft(email: any) {
    setEditingDraftId(email.id)
    setComposeTo(email.to?.[0]?.email || '')
    setComposeCc(email.cc?.[0]?.email || '')
    setComposeBcc(email.bcc?.[0]?.email || '')
    setComposeSubject(email.subject || '')
    setComposeBody(email.body || email.processed_html || '')
    setComposeAttachments([])
    setShowCcBcc(false)
    setShowCompose(true)
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

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(replyTo.trim())) {
      alert('Please enter a valid email address in the "To" field')
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
      const message = editingDraftId ? 'Save changes to this draft?' : 'Save this email to drafts before closing?'
      const saveToDraft = confirm(message)
      if (saveToDraft) {
        try {
          if (editingDraftId) {
            // When editing existing draft, update it directly
            await mailApi.updateDraft(editingDraftId, {
              to: composeTo,
              cc: composeCc || undefined,
              bcc: composeBcc || undefined,
              subject: composeSubject || '(no subject)',
              body: composeBody,
              attachments: composeAttachments.length > 0 ? composeAttachments : undefined
            })
          } else {
            // Create new draft
            await mailApi.createDraft({
              to: composeTo,
              cc: composeCc || undefined,
              bcc: composeBcc || undefined,
              subject: composeSubject || '(no subject)',
              body: composeBody,
              attachments: composeAttachments.length > 0 ? composeAttachments : undefined
            })
          }

          setShowCompose(false)
          setComposeTo('')
          setComposeCc('')
          setComposeBcc('')
          setComposeSubject('')
          setComposeBody('')
          setComposeAttachments([])
          setShowCcBcc(false)
          setEditingDraftId(null)

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
    setEditingDraftId(null)
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
      setEditingDraftId(null)

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
            {((selectedFolder === 'drafts') || (selectedEmail.tags && selectedEmail.tags.some((tag: any) => tag.id === 'DRAFT'))) && (
              <Button variant="outline-primary" size="sm" className="ms-1" onClick={() => handleEditDraft(selectedEmail)} title="Edit Draft">
                <BiEdit />
              </Button>
            )}
          </div>
          <div className="ms-auto d-flex align-items-center">
            <Button
              variant="outline-primary"
              size="sm"
              onClick={() => window.open(getGmailMessageUrl(selectedEmail.id), '_blank')}
              className="me-2"
              title="Open in Gmail"
            >
              <FaExternalLinkAlt />
            </Button>
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
            <div><strong>From:</strong> {typeof selectedEmail.sender === 'string' ? selectedEmail.sender : (selectedEmail.sender?.name || selectedEmail.sender?.email || 'Unknown')}</div>
            {selectedEmail.to && selectedEmail.to.length > 0 && (
              <div><strong>To:</strong> {selectedEmail.to.map((t: any) => typeof t === 'string' ? t : (t.name || t.email)).join(', ')}</div>
            )}
            {selectedEmail.cc && selectedEmail.cc.length > 0 && (
              <div><strong>Cc:</strong> {selectedEmail.cc.map((c: any) => typeof c === 'string' ? c : (c.name || c.email)).join(', ')}</div>
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
                        const height = Math.max(
                          doc.body.scrollHeight,
                          doc.documentElement.scrollHeight,
                          doc.body.offsetHeight,
                          doc.documentElement.offsetHeight,
                          doc.body.clientHeight,
                          doc.documentElement.clientHeight
                        )
                        iframe.style.height = height + 40 + 'px'
                      }
                    } catch (e) {}
                  }
                  
                  iframe.onload = () => {
                    resizeIframe()
                    setTimeout(resizeIframe, 200)
                    setTimeout(resizeIframe, 500)
                    setTimeout(resizeIframe, 1000)
                  }
                  
                  setTimeout(resizeIframe, 100)
                  
                  const observer = new MutationObserver(() => {
                    resizeIframe()
                  })
                  
                  setTimeout(() => {
                    try {
                      const doc = iframe.contentDocument || iframe.contentWindow?.document
                      if (doc && doc.body) {
                        observer.observe(doc.body, {
                          childList: true,
                          subtree: true,
                          attributes: true,
                          attributeFilter: ['style', 'class']
                        })
                      }
                    } catch (e) {}
                  }, 500)
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
                  <body>${selectedEmail.processedHtml || selectedEmail.processed_html || selectedEmail.body}</body>
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
          {/* [CHANGED] Mailbox column: fully hidden on mobile */}
          <Col md={2} className="folder-column d-none d-md-block">
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
                        {String(f.id).toLowerCase() === 'spam' && <FaBan className="me-2" />}
                        {String(f.id).toLowerCase() === 'important' && <FaExclamationTriangle className="me-2" />}
                        {String(f.id).toLowerCase() === 'archive' && <FaFileArchive className="me-2" />}
                        {String(f.id).toLowerCase() === 'trash' && <FaTrash className="me-2" />}
                        {(String(f.id).toLowerCase() === 'todo' || String(f.name || '').toLowerCase() === 'to do') && <FaTasks className="me-2" />}
                        {(String(f.id).toLowerCase() === 'snoozed' || String(f.name || '').toLowerCase() === 'snoozed') && <FaClock className="me-2" />}
                        {String(f.id).toLowerCase() === 'done' && <FaCheckSquare className="me-2" />}
                        {(!['inbox', 'starred', 'sent', 'draft', 'spam', 'important', 'archive', 'trash', 'todo', 'snoozed', 'done'].includes(String(f.id).toLowerCase()) &&
                          !['to do', 'snoozed'].includes(String(f.name || '').toLowerCase())) && <FaFolder className="me-2" />}
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
                    <h5 className="m-0 text-white">
                      Project Board
                    </h5>
                    <Button 
                      variant="outline-info" 
                      onClick={() => setViewMode('list')}
                      className="d-flex align-items-center gap-2"
                    >
                      <BsListUl /> Back to List
                    </Button>
                  </div>
                  <div className="flex-grow-1" style={{ overflow: 'auto', height: '100%' }}>
                    <KanbanBoard 
                      onOpenEmail={(email) => openEmail(email)} 
                    />
                  </div>
                </>
              )}
            </Col>
          ) : (
            <>
          {/* [CHANGED] List column: hide on mobile when in detail view */}
          <Col
            md={4}
            className={`email-list-column ${mobileView === 'detail' ? 'd-none d-md-flex' : 'd-flex'}`}
          >
             {/* [Cập nhật] Header cho trang kết quả tìm kiếm */}

            <div className="email-list-actions d-flex align-items-center mb-2 gap-2">
              <OverlayTrigger placement="bottom" overlay={<Tooltip>Switch View</Tooltip>}>
                <Button 
                  variant="outline-info" 
                  className="me"
                  onClick={() => setViewMode(viewMode === 'list' ? 'kanban' : 'list')}
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
              {/* Chèn đoạn này vào bên trên hoặc bên cạnh các nút Action hiện tại */}
              <div className="d-flex gap-2 mb-2 w-100">
                {/* Sort Control */}
                <Form.Select 
                  size="sm" 
                  style={{ maxWidth: '150px' }}
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as any)}
                >
                  <option value="date-desc">Newest first</option>
                  <option value="date-asc">Oldest first</option>
                  <option value="sender-asc">Sender (A-Z)</option>
                </Form.Select>

                {/* Filter Control */}
                <Form.Select 
                  size="sm" 
                  style={{ maxWidth: '150px' }}
                  value={filterMode}
                  onChange={(e) => setFilterMode(e.target.value as any)}
                >
                  <option value="all">All Emails</option>
                  <option value="unread">Unread Only</option>
                  <option value="has-attachment">Has Attachments</option>
                </Form.Select>
              </div>

              {/* Hiển thị lỗi nếu có (F2 Error State) */}
              {error && <div className="alert alert-danger p-2 mb-2">{error}</div>}
            </div>

            <div
              className="email-list"
              ref={listRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
            >
              {loadingFolders.has(selectedFolder) ? (
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
                      {autoSyncAttempted && <p className="small text-warning">Email index has been synced but no matching emails found.</p>}
                      <Button variant="link" onClick={clearSearch}>Return to Inbox</Button>
                    </div>
                ) : (
                  <ListGroup variant="flush">
                    {displayList.map((email: any, idx: number) => {
                      const id = email.id
                      const isRead = ('read' in email) ? !!email.read : (email.unread === false)
                      const sender = typeof email.sender === 'string'
                        ? email.sender
                        : (email.sender?.name || email.sender?.email || 'Unknown')
                      const subject = email.subject || ''
                      const preview = email.body || email.preview || ''
                      const ts = email.timestamp || (email.receivedOn ? Date.parse(email.receivedOn) : Date.now())
                      const rawLabels = email.labels || email.tags || [];
                      const isStarred = 
                        // Case 1: Array of strings (['STARRED', 'INBOX'])
                        (Array.isArray(rawLabels) && rawLabels.some((l: any) => 
                            typeof l === 'string' && (l === 'starred' || l === 'STARRED')
                        )) ||
                        // Case 2: Array of objects ([{id: 'STARRED', ...}])
                        (Array.isArray(rawLabels) && rawLabels.some((t: any) => 
                            typeof t === 'object' && (t.id === 'STARRED' || t.name === 'STARRED' || t.id === 'starred')
                        ));
                      return (
                        <ListGroup.Item
                          id={`email-row-${id}`}
                          key={id}
                          action
                          className={`email-row d-flex align-items-start ${isRead ? 'read' : 'unread'} ${cursorIndex === idx ? 'cursor' : ''}`}
                          onClick={(e) => {
                            e.preventDefault()
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
                            {isStarred ? (
                                <FaStar className="starred-active" size={16} /> 
                            ) : (
                                <FaRegStar size={16} />
                            )}
                            </div>
                          <div className="meta-col flex-fill">
                            <div className="row-top d-flex justify-content-between">
                              <div className="sender">{sender}</div>
                              <div className="time">{timeAgo(ts)}</div>
                            </div>
                            <div className="subject">{subject}</div>
                            <div className="preview" style={{ userSelect: 'none' }}>{preview}</div>
                          </div>
                        </ListGroup.Item>
                      )
                    })}
                  </ListGroup>
                )}
                
                {/* Pagination Controls */}
                {selectedFolder !== 'search_results' && displayList.length > 0 && (
                  <div className="pagination-controls d-flex justify-content-between align-items-center p-3 border-top">
                    <Button 
                      variant="outline-light" 
                      size="sm"
                      disabled={!currentPageMap[selectedFolder] || currentPageMap[selectedFolder] <= 1}
                      onClick={goToPreviousPage}
                    >
                      Previous
                    </Button>
                    <span className="text-white small">
                      Page {currentPageMap[selectedFolder] || 1}
                    </span>
                    <Button 
                      variant="outline-light" 
                      size="sm"
                      disabled={!currentPageMap[selectedFolder] || currentPageMap[selectedFolder] >= (totalPagesMap[selectedFolder] || 1)}
                      onClick={goToNextPage}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
              )}
            </div>
          </Col>

          {/* [CHANGED] Detail column: hide on mobile when in list view */}
          <Col
            md={6}
            className={`email-detail-column ${mobileView === 'list' ? 'd-none d-md-flex' : 'd-flex'}`}
          >
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
              <Form.Control value={replyTo} readOnly />
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