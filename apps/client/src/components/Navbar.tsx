// apps/client/src/components/Navbar.tsx

import { useState, useEffect, useRef } from "react";
import Navbar from "react-bootstrap/Navbar";
import Nav from "react-bootstrap/Nav";
import Container from "react-bootstrap/Container";
import Dropdown from "react-bootstrap/Dropdown";
import Image from "react-bootstrap/Image";
import logo from "../../public/logo-title.svg";
import { Link } from "react-router-dom";
import { useNavigate } from 'react-router-dom'
import Form from "react-bootstrap/Form";
import InputGroup from "react-bootstrap/InputGroup";
import ListGroup from "react-bootstrap/ListGroup"; // [NEW] For suggestion list

import { ImBlog } from "react-icons/im";
import {
  AiOutlineFundProjectionScreen,
  AiOutlineUser,
  AiOutlineLogout,
  AiOutlineSearch,
} from "react-icons/ai";
import useAuthStore from '../store/authStore'
import { useLogout } from '../hooks/useAuth'
import mailApi from "../api/mail";
import { useSearch } from '../contexts/SearchContext'; // [NEW] Import API

function NavBar() {
  const [expand, updateExpanded] = useState(false);
  const [navColour, updateNavbar] = useState(false);

  // Search States
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]); // [NEW] Store suggestions
  const [showSuggestions, setShowSuggestions] = useState(false); // [NEW] Toggle dropdown

  const { searchResults, lastSearchQuery, setSelectedEmail } = useSearch();

  // Sync searchQuery with lastSearchQuery for suggestions
  useEffect(() => {
    if (lastSearchQuery && !searchQuery) {
      setSearchQuery(lastSearchQuery);
    }
  }, [lastSearchQuery, searchQuery]);
  
  // Ref to handle clicking outside the suggestion box
  const searchContainerRef = useRef<HTMLFormElement>(null);

  function scrollHandler() {
    if (window.scrollY >= 20) {
      updateNavbar(true);
    } else {
      updateNavbar(false);
    }
  }

  useEffect(() => {
    window.addEventListener("scroll", scrollHandler);
    // Click outside listener
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    
    return () => {
      window.removeEventListener("scroll", scrollHandler);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);
  
  const navigate = useNavigate()

  const user = useAuthStore(s => s.user)
  const initializing = useAuthStore(s => s.initializing)
  const logoutMutation = useLogout()

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync()
    } catch (e) {
      console.error('Logout failed', e)
    }

    try {
      localStorage.removeItem('email_previews_map')
    } catch (e) {}
    try {
      delete (await import('../api/client')).api.defaults.headers.common['Authorization']
    } catch (e) {}
    try {
      useAuthStore.getState().clearUser()
      useAuthStore.getState().clearAccessToken()
    } catch (e) {}

    navigate('/login')
  }

  // [NEW] Debounced auto-suggestions from API
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchQuery.length >= 2) {
        try {
          const results = await mailApi.searchEmailsSemantic(searchQuery);
          const list = Array.isArray(results) ? results : [];
          setSuggestions(list);
          setShowSuggestions(list.length > 0);
        } catch (error) {
          console.error("Auto-suggest failed", error);
          setSuggestions([]);
          setShowSuggestions(false);
        }
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement> | React.FormEvent) => {
    if ((e as React.KeyboardEvent).key === 'Enter' || e.type === 'submit') {
      e.preventDefault();
      performSearch(searchQuery);
    }
  }

  // [NEW] Helper to trigger search navigation
  const performSearch = (query: string) => {
    updateExpanded(false);
    setShowSuggestions(false);
    // Navigate triggers the Dashboard to load, which executes the Semantic Search
    navigate(`/dashboard?q=${encodeURIComponent(query)}`);
  }

  // [NEW] Handle clicking a suggestion
  const handleSuggestionClick = async (email: any) => {
    updateExpanded(false);
    setShowSuggestions(false);

    try {
      // Fetch full email data from API
      const data = await mailApi.getEmail(email.id);
      const message = data.latest || data.messages?.[0] || data;
      const senderStr = typeof message.sender === 'string'
        ? message.sender
        : (message.sender?.name || message.sender?.email || 'Unknown');

      const actualMessageId = message.id || message.message_id || email.id;
      const processedHtml = message.processedHtml || message.processed_html || message.body || message.decoded_body || '';

      // Set selected email in global context
      setSelectedEmail({
        ...message,
        id: email.id,
        messageId: actualMessageId,
        sender: senderStr,
        body: processedHtml,
        subject: message.subject || message.title || '(No Subject)',
        to: message.to || [],
        cc: message.cc || [],
        attachments: message.attachments || []
      });

      // Mark as read if unread
      if (email.unread) {
        try {
          await mailApi.modifyEmail(email.id, { unread: false });
        } catch (e) {
          console.error('Failed to mark email as read:', e);
        }
      }
    } catch (error) {
      console.error('Failed to load email details:', error);
    }
  }

  return (
    <Navbar
      expanded={expand}
      fixed="top"
      expand="md"
      className={navColour ? "sticky" : "navbar"}
    >
      <Container>
        <Navbar.Brand href="/" className="d-flex">
          <img src={logo} className="img-fluid logo" alt="brand" />
        </Navbar.Brand>
        
        {user && (
          // Added ref for click-outside detection
          <Form 
            ref={searchContainerRef}
            className="d-flex mx-auto search-box-nav position-relative" 
            onSubmit={handleSearch} 
            style={{ maxWidth: '400px', width: '100%' }}
          >
            <InputGroup>
              <InputGroup.Text className="bg-white border-end-0">
                <AiOutlineSearch />
              </InputGroup.Text>
              <Form.Control
                type="search"
                placeholder="Search emails..."
                className="border-start-0 ps-0"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearch}
                onFocus={() => {
                    // Show suggestions again if we have query and results
                    if (searchQuery.length >= 2 && suggestions.length > 0) setShowSuggestions(true);
                }}
                aria-label="Search"
              />
            </InputGroup>

            {/* [NEW] Type-ahead Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <ListGroup
                className="position-absolute w-100 shadow mt-1"
                style={{
                    top: '100%',
                    zIndex: 1050,
                    maxHeight: '400px',
                    overflowY: 'auto',
                    border: '1px solid rgba(0,0,0,0.1)',
                    borderRadius: '4px'
                }}
              >
                {suggestions.map((item: any, idx) => {
                   const subject = item.subject || "(No Subject)";
                   const senderName = typeof item.sender === 'string'
                        ? item.sender
                        : (item.sender?.name || item.sender?.email || "Unknown");

                   return (
                    <ListGroup.Item
                        key={item.id || idx}
                        action
                        onClick={() => handleSuggestionClick(item)}
                        className="d-flex flex-column border-start-0 border-end-0"
                        style={{ cursor: 'pointer' }}
                    >
                        <div className="fw-bold text-truncate" style={{ fontSize: '0.9rem' }}>
                            {subject}
                        </div>
                        <div className="text-muted small text-truncate">
                            <span className="me-1">From:</span>
                            {senderName}
                        </div>
                    </ListGroup.Item>
                   )
                })}
              </ListGroup>
            )}
          </Form>
        )}

        <Navbar.Toggle
          aria-controls="responsive-navbar-nav"
          onClick={() => {
            updateExpanded(!expand);
          }}
        >
          <span></span>
          <span></span>
          <span></span>
        </Navbar.Toggle>
        
        {/* ... Rest of the Navbar code (Collapse, Nav Links, User Dropdown) remains unchanged ... */}
        <Navbar.Collapse id="responsive-navbar-nav">
          <Nav className="ms-auto" defaultActiveKey="#home">
            <Nav.Item>
              <Nav.Link
                as={Link}
                to="/dashboard"
                onClick={() => updateExpanded(false)}
              >
                <AiOutlineFundProjectionScreen
                  style={{ marginBottom: "2px" }}
                />{" "}
                Dashboard
              </Nav.Link>
            </Nav.Item>

            {!user ? (
              initializing ? null : (
                <>
                  <Nav.Item>
                    <Nav.Link
                      as={Link}
                      to="/login"
                      onClick={() => updateExpanded(false)}
                    >
                      <AiOutlineUser style={{ marginBottom: "2px" }} /> Sign in
                    </Nav.Link>
                  </Nav.Item>

                  <Nav.Item>
                    <Nav.Link
                      as={Link}
                      to="/signup"
                      onClick={() => updateExpanded(false)}
                    >
                      <ImBlog style={{ marginBottom: "2px" }} /> Sign up
                    </Nav.Link>
                  </Nav.Item>
                </>
              )
            ) : (
              <Nav.Item className="d-flex align-items-center">
                <Dropdown align="end">
                  <Dropdown.Toggle
                    id="user-dropdown"
                    variant="light"
                    className="d-flex align-items-center border-0 user-pill-toggle"
                  >
                    {(() => {
                      const email = user?.email ?? ''
                      const name = (user as any)?.name ?? ''
                      const provider = (user as any)?.provider as ('google' | 'email' | undefined)
                      const isGoogle = provider === 'google' || (!!user?.picture && !provider)
                      const displayName = isGoogle ? (name || email) : (name || email)
                      const avatarUrl = user?.picture || user?.avatar
                      const fallbackInitial = (displayName || '?').charAt(0).toUpperCase()
                      return (
                        <span className="d-flex align-items-center" style={{ color: '#fff' }}>
                          {avatarUrl ? (
                            <Image
                              src={avatarUrl}
                              alt="avatar"
                              roundedCircle
                              width={32}
                              height={32}
                              style={{ objectFit: 'cover', border: '2px solid rgba(255,255,255,0.9)' }}
                            />
                          ) : (
                            <span
                              aria-label="avatar"
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: '50%',
                                backgroundColor: 'rgba(255,255,255,0.9)',
                                color: '#c95bf5',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 600,
                                border: '2px solid rgba(255,255,255,0.9)'
                              }}
                            >
                              {fallbackInitial}
                            </span>
                          )}
                          <span className="ms-2" style={{ fontSize: 13 }}>
                            {displayName}
                          </span>
                        </span>
                      )
                    })()}
                  </Dropdown.Toggle>
                  <Dropdown.Menu className="shadow border-0 purple-dropdown-menu">
                    <Dropdown.Header>
                      {(() => {
                        const email = user?.email ?? ''
                        const name = (user as any)?.name ?? ''
                        const provider = (user as any)?.provider as ('google' | 'email' | undefined)
                        const isGoogle = provider === 'google' || (!!user?.picture && !provider)
                        const displayName = isGoogle ? (name || email) : (name || email)
                        return (
                          <>
                            <span className="text-white-50">Signed in as</span>
                            <div style={{ fontWeight: 600, color: '#fff' }}>{displayName}</div>
                            {email ? (
                              <div className="text-white-50" style={{ fontSize: 12 }}>{email}</div>
                            ) : null}
                          </>
                        )
                      })()}
                    </Dropdown.Header>
                    <Dropdown.Divider style={{ borderTopColor: 'rgba(255,255,255,0.2)' }} />
                    <Dropdown.Item className="purple-dropdown-item" onClick={() => { handleLogout(); updateExpanded(false) }}>
                      <AiOutlineLogout className="logout-icon-blue" style={{ marginBottom: '2px' }} /> <span className="logout-text-blue">Logout</span>
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>
              </Nav.Item>
            )}
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}

export default NavBar;