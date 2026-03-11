https = require('https');
https.get('https://api.streamelements.com/kappa/v2/speech?voice=Vitoria&text=Ola+Mundo', (res) => {
    console.log(res.statusCode);
});
