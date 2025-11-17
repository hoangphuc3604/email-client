import Card from "react-bootstrap/Card";
import { ImPointRight } from "react-icons/im";

function AboutCard() {
  return (
    <Card className="quote-card-view">
      <Card.Body>
        <blockquote className="blockquote mb-0">
          <p style={{ textAlign: "justify" }}>
            Welcome to the <span className="purple">Mail Dashboard</span>, a
            React SPA project.
            <br />
            This application was built to demonstrate a
            <span className="purple"> complete client-side email app</span>,
            focusing on <span className="purple">authentication flows</span> and
            a <span className="purple">functional UI mockup</span>.
            <br />
            <br />
            Key features of this application include:
          </p>

          <ul>
            <li className="about-activity">
              <ImPointRight /> Email/Password & Google Sign-In Auth 🔑
            </li>
            <li className="about-activity">
              <ImPointRight /> 3-Column Responsive Layout (Mailbox, List, Detail)
              📬
            </li>
            <li className="about-activity">
              <ImPointRight /> Auto Access & Refresh Token Handling 🔄
            </li>
          </ul>

          <p style={{ color: "rgb(155 126 172)" }}>
            "Goal: To build a secure and user-friendly email dashboard."{" "}
          </p>
          <footer className="blockquote-footer">React G03 Project</footer>
        </blockquote>
      </Card.Body>
    </Card>
  );
}

export default AboutCard;