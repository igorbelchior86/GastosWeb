/*
 * Firebase configuration
 *
 * Exports Firebase configuration objects for different environments. The
 * consumer can choose the appropriate configuration when calling
 * AuthService.init() or FirebaseService.init(). The default export
 * selects the `test` configuration when running in development and the
 * `production` configuration otherwise. You can override this by
 * explicitly importing the desired named export.
 */

export const testConfig = {
  apiKey: 'AIzaSyCmIG1LXQyYDIHcbtcwD4-YUYl5BanuZe4',
  authDomain: 'gastosweb-test.firebaseapp.com',
  databaseURL: 'https://gastosweb-test-default-rtdb.firebaseio.com',
  projectId: 'gastosweb-test',
  storageBucket: 'gastosweb-test.firebasestorage.app',
  messagingSenderId: '1018674528871',
  appId: '1:1018674528871:web:953908eccb102cbdc60ac2',
  measurementId: 'G-944T3Z4YR0'
};

export const productionConfig = {
  apiKey: 'AIzaSyATGZtBlnSPnFtVgTqJ_E0xmBgzLTmMkI0',
  authDomain: 'gastosweb-e7356.firebaseapp.com',
  databaseURL: 'https://gastosweb-e7356-default-rtdb.firebaseio.com',
  projectId: 'gastosweb-e7356',
  storageBucket: 'gastosweb-e7356.firebasestorage.app',
  messagingSenderId: '519966772782',
  appId: '1:519966772782:web:9ec19e944e23dbe9e899bf',
  measurementId: 'G-JZYYGSJKTZ'
};

// Use PRODUCTION by default for the web/PWA runtime. NODE_ENV is not
// reliably available in the browser, so defaulting to production here
// ensures the app connects to the PROD Firebase project.
export const firebaseConfig = productionConfig;

export default firebaseConfig;
