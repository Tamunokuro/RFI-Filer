const Footer = () => {
  return (
    <footer className="bg-slate-200 text-indigo-950 py-16 mt-auto">
      <div className="container flex justify-between mx-auto text-center">
        <h1>Filer Administrative Assistant</h1>
        <p className="text-sm">
          &copy; {new Date().getFullYear()} Filer.AA All rights reserved.
        </p>
      </div>
    </footer>
  );
};

export default Footer;
