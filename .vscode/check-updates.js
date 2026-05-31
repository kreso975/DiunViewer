const libs = [
   {
      name: "FontAwesome",
      local: "7.2.0",
      npm: "@fortawesome/fontawesome-free",
      type: "css",
      download: "https://github.com/FortAwesome/Font-Awesome/releases"
   },
   {
      name: "Bootstrap Icons",
      local: "1.13.1",
      npm: "bootstrap-icons",
      type: "css",
      download: "https://github.com/twbs/icons/releases"
   },
   {
      name: "DataTables Bootstrap 5",
      local: "2.3.8",
      npm: "datatables.net-bs5",
      type: "css+js",
      download: "https://datatables.net/download/"
   },
   {
      name: "Bootstrap",
      local: "5.3.8",
      npm: "bootstrap",
      type: "js",
      download: "https://github.com/twbs/bootstrap/releases"
   },
   {
      name: "jQuery",
      local: "3.7.1",
      npm: "jquery",
      type: "js",
      download: "https://jquery.com/download/"
   },
   {
      name: "AdminLTE",
      local: "4.0.0",
      npm: "admin-lte",
      type: "css+js",
      download: "https://github.com/ColorlibHQ/AdminLTE/releases"
   }
];


// Node 20+ has global fetch

async function getLatestVersion(pkg) {
   const url = `https://registry.npmjs.org/${pkg}/latest`;
   const res = await fetch(url);
   const json = await res.json();
   return json.version;
}

(async () => {
   console.log("Checking CSS/JS library versions...\n");

   for (const lib of libs) {
      const latest = await getLatestVersion(lib.npm);

      // Special handling for jQuery
      if (lib.npm === "jquery") {
         const res = await fetch("https://registry.npmjs.org/jquery");
         const json = await res.json();

         const versions = Object.keys(json.versions);

         const latest3 = versions
            .filter(v => v.startsWith("3."))
            .sort((a, b) => (a > b ? -1 : 1))[0];

         const latest4 = versions
            .filter(v => v.startsWith("4."))
            .sort((a, b) => (a > b ? -1 : 1))[0];

         if (lib.local === latest3) {
            console.log(`jQuery: up to date (${lib.local})`);
         } else {
            console.log(`jQuery: local ${lib.local} → latest ${latest3}  SAFE UPDATE`);
            console.log(`Download: ${lib.download}\n`);
         }

         console.log(`jQuery 4.x available: ${latest4}  (BREAKING UPDATE — not compatible)`);
         continue;
      }


      // Normal logic for all other libraries
      if (lib.local === latest) {
         console.log(`${lib.name}: up to date (${lib.local})`);
      } else {
         console.log(`${lib.name}: local ${lib.local} → latest ${latest}  UPDATE AVAILABLE`);
         console.log(`Download: ${lib.download}\n`);
      }
   }
})();
