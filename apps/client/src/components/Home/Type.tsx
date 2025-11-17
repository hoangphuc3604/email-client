import Typewriter from "typewriter-effect";

function Type() {
  return (
    <Typewriter
      options={{
        strings: [
          "Manage Your Emails Effortlessly",
          "Organize. Filter. Automate.",
          "Smart Spam Protection",
          "Fast & Secure Email System",
        ],
        autoStart: true,
        loop: true,
        deleteSpeed: 50,
      }}
    />
  );
}

export default Type;
