import { Container, Row, Col } from "react-bootstrap";
import myImg from "../../Assets/avatar.svg";
import Tilt from "react-parallax-tilt";

function Home2() {
  return (
    <Container fluid className="home-about-section" id="about">
      <Container>
        <Row>
          <Col md={8} className="home-about-description">
            <h1 style={{ fontSize: "2.6em" }}>
              LET ME <span className="purple"> INTRODUCE </span> OUR PROJECT
            </h1>
            <p className="home-about-body">
            I’m developing a smart and modern Email Management System designed to make handling emails easier, faster, and more organized.
            <br />
            <br />
            Throughout this project, I’ve focused on building tools that improve productivity through features like automated sorting, email categorization, analytics, and secure message handling.
            <br />
            <br />
            This platform is powered by
            <i>
              <b className="purple">
                {" "}
                Node.js, React.js, Express, and MongoDB{" "}
              </b>
            </i>
            — ensuring reliability, scalability, and a smooth user experience.
            <br />
            <br />
            I’m passionate about creating
            <i>
              <b className="purple">
                {" "}
                efficient email workflows, real-time monitoring,{" "}
              </b>
            </i>
            and building tools that help users stay organized and work more efficiently every day.
            <br />
            <br />
            Whenever possible, I focus on crafting clean UI experiences with
            <b className="purple"> React.js </b> and building secure, high-performance services using{" "}
            <i>
              <b className="purple">Node.js</b> and{" "}
              <b className="purple">modern backend architectures</b>.
            </i>
          </p>

          </Col>
          <Col md={4} className="myAvtar">
            <Tilt>
              <img src={myImg} className="img-fluid" alt="avatar" />
            </Tilt>
          </Col>
        </Row>
      </Container>
    </Container>
  );
}
export default Home2;
