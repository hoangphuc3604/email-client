interface PreProps {
  load?: boolean;
}

function Pre({ load = false }: PreProps) {
  return <div id={load ? "preloader" : "preloader-none"}></div>;
}

export default Pre;
