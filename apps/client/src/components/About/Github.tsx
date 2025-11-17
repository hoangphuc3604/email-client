import { GitHubCalendar } from "react-github-calendar";
import { Row } from "react-bootstrap";

function Github() {
  return (
    <Row
      style={{
        justifyContent: "center",
        paddingBottom: "10px",
        color: "white",
      }}
    >
      <h1 className="project-heading pb-4" style={{ paddingBottom: "20px" }}>
        Development <strong className="purple">Progress</strong>
      </h1>
      <GitHubCalendar
        username="soumyajit4419" // <--- CHANGE THIS to your GitHub username
        blockSize={30}
        blockMargin={10}
        fontSize={20}
        theme={{
          light: ["#f2ebfa", "#e3c8f7", "#d2a3f3", "#c084f5", "#a858e9"],
          dark: ["#2d2240", "#5a2e80", "#7a3ab0", "#9c4ae0", "#c084f5"],
        }}
      />
    </Row>
  );
}

export default Github;