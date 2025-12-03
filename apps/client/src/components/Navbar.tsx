import { useState } from "react";
import Navbar from "react-bootstrap/Navbar";
import Nav from "react-bootstrap/Nav";
import Container from "react-bootstrap/Container";
import logo from "../../public/logo-title.svg";
import { Link } from "react-router-dom";
import { useNavigate } from 'react-router-dom'
import { ImBlog } from "react-icons/im";
import {
  AiOutlineFundProjectionScreen,
  AiOutlineUser,
  AiOutlineLogout,
} from "react-icons/ai";
import useAuthStore from '../store/authStore'
import { useLogout } from '../hooks/useAuth'

function NavBar() {
  const [expand, updateExpanded] = useState(false);
  const [navColour, updateNavbar] = useState(false);

  function scrollHandler() {
    if (window.scrollY >= 20) {
      updateNavbar(true);
    } else {
      updateNavbar(false);
    }
  }

  window.addEventListener("scroll", scrollHandler);
  const navigate = useNavigate()

  const user = useAuthStore(s => s.user)
  const initializing = useAuthStore(s => s.initializing)
  const logoutMutation = useLogout()

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync()
    } catch (e) {
      // ignore server errors — we'll still clear client state
      console.error('Logout failed', e)
    }

    // Ensure client-side tokens/state cleared and redirect to login
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
              <Nav.Item>
                <Nav.Link onClick={() => { handleLogout(); updateExpanded(false) }} aria-label="Logout">
                  <AiOutlineLogout style={{ marginBottom: "2px" }} /> Logout
                </Nav.Link>
              </Nav.Item>
            )}
{/* 
            <Nav.Item className="fork-btn">
              <Button
                href=""
                target="_blank"
                className="fork-btn-inner"
              >
                <CgGitFork style={{ fontSize: "1.2em" }} />{" "}
                <AiFillStar style={{ fontSize: "1.1em" }} />
              </Button>
            </Nav.Item> */}
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}

export default NavBar;
