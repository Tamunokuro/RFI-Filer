const Footer = () => {
  return (
    <footer className="bg-slate-200 dark:bg-gray-900 text-indigo-950 dark:text-indigo-200 border-t border-slate-300 dark:border-gray-700 py-16 mt-auto">
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
