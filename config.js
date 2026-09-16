/* ============================================================
   RenewalFlow configuration
   This is the ONLY file you need to edit before deploying.
   ============================================================ */

window.RENEWALFLOW_CONFIG = {

  /* ----------------------------------------------------------
     1. GOOGLE DRIVE SYNC  (optional — the app works without it)

     Paste the OAuth "Web application" client ID you created in
     Google Cloud Console. See GOOGLE_DRIVE_SETUP.md for steps.

     Leave it as-is to run the app with local storage only.
     ---------------------------------------------------------- */
  googleClientId: '254935952024-gtre4sd8oj0f43dgou580ni0hmkqidqf.apps.googleusercontent.com',

  /* Name of the file created in your Google Drive. */
  driveFileName: 'RenewalFlow-data.json',


  /* ----------------------------------------------------------
     2. SIGN-IN

     This is a front-end gate, not real security. Anyone can read
     these values in the browser's view-source. It keeps casual
     visitors out of the dashboard; it does not protect the data.
     Do not reuse a password you use anywhere else.

     To change the login, run this in your browser console
     (F12 -> Console) with your own username and password:

       u='Rajesh'; p='Rajesh7107';
       crypto.subtle.digest('SHA-256', new TextEncoder().encode(u+':'+p))
         .then(h=>console.log([...new Uint8Array(h)]
           .map(b=>b.toString(16).padStart(2,'0')).join('')));

     Paste the printed hash below and update the username.
     Current values match username "Rajesh", password "Rajesh7107".
     ---------------------------------------------------------- */
  username: 'Rajesh',
  passwordHash: '2edbdcedd076cbbd934e0cd947da5d5731004780d85841ea266469adc4234bd4',


  /* ----------------------------------------------------------
     3. REGIONAL SETTINGS
     ---------------------------------------------------------- */

  /* Country code added to 10-digit WhatsApp numbers. 91 = India. */
  defaultCountryCode: '91',

  /* Time the calendar reminder is created at, 24-hour clock. */
  reminderTime: '08:30'
};
