const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(bodyParser.json());

// Configuración de Versapay (Helper para Lazy Loading)
const getVpConfig = () => ({
    subdomain: process.env.VERSAPAY_SUBDOMAIN,
    apiKey: process.env.VERSAPAY_API_KEY,
    apiToken: process.env.VERSAPAY_API_TOKEN,
    gateway: process.env.VERSAPAY_GATEWAY,
    email: process.env.VERSAPAY_EMAIL,
    password: process.env.VERSAPAY_PASSWORD,
    account: process.env.VERSAPAY_ACCOUNT
});

// Endpoint para obtener configuración pública
app.get('/api/config', (req, res) => {
    const config = getVpConfig();
    console.log('Serving config with subdomain:', config.subdomain);
    res.json({
        subdomain: config.subdomain
    });
});

// Endpoint para obtener la Session Key (Reemplaza getVSessionKey de PHP)
app.post('/api/session', async (req, res) => {
    try {
        const config = getVpConfig();
        const { orderTotal } = req.body;

        const url = `https://${config.subdomain}.versapay.com/api/v1/sessions`;

        let params = {
            gatewayAuthorization: {},
            options: {
                orderTotal: orderTotal || "0.00",
                paymentTypes: [],
                fields: []
            }
        };

        // Lógica de autenticación: Priorizar API Token si existe, sino usar Legacy
        if (config.apiToken && config.apiKey) {
            console.log('Using API Token Auth');
            params.gatewayAuthorization.apiToken = config.apiToken;
            params.gatewayAuthorization.apiKey = config.apiKey;

            // Configurar AVS Rules explícitamente (aunque sean false)
            // params.options.avsRules = {
            //     rejectAddressMismatch: false,
            //     rejectPostCodeMismatch: false,
            //     rejectUnknown: false
            // };

            // Credit Card
            params.options.paymentTypes.push({
                name: "creditCard",
                promoted: false,
                label: "Payment Card",
                fields: [
                    { name: "cardholderName", label: "Cardholder Name", errorLabel: "Cardholder name" },
                    { name: "accountNo", label: "Account Number", errorLabel: "Credit card number" },
                    { name: "expDate", label: "Expiration Date", errorLabel: "Expiration date" },
                    { name: "cvv", label: "Security code", allowLabelUpdate: false, errorLabel: "Security code" }
                ]
            });
        } else {
            // Legacy Auth (Gateway/Email/Password)
            console.log('Using Legacy Auth (Gateway/Email/Pass)');
            params.gatewayAuthorization.gateway = config.gateway;
            params.gatewayAuthorization.email = config.email;
            params.gatewayAuthorization.password = config.password;
            // IMPORTANTE: En legacy, 'accounts' es un array
            params.gatewayAuthorization.accounts = [{ type: "creditCard", account: config.account }];

            // Campos legacy
            params.options.fields = [
                { name: "cardholderName", label: "Cardholder Name", errorLabel: "Cardholder name" },
                { name: "accountNo", label: "Account Number", errorLabel: "Credit card number" },
                { name: "expDate", label: "Expiration Date", errorLabel: "Please check the Expiration Date" },
                { name: "cvv", label: "Security code", errorLabel: "Enter Security Code", allowLabelUpdate: false }
            ];
        }

        console.log('Solicitando sesión a Versapay:', url);
        console.log('Request Payload:', JSON.stringify(params, null, 2));

        const response = await axios.post(url, params, {
            headers: { 'Content-Type': 'application/json' }
        });

        console.log('Sesión creada exitosamente:', response.data);
        res.json({ sessionKey: response.data.id });

    } catch (error) {
        console.error('Error obteniendo session key:', error.response ? JSON.stringify(error.response.data) : error.message);
        res.status(500).json({ error: 'Failed to create payment session' });
    }
});

// Endpoint para procesar el pago (Reemplaza validate_versapay_payment de PHP)
app.post('/api/process-payment', async (req, res) => {
    try {
        const config = getVpConfig();
        const {sessionKey, payments, billingAddress, shippingAddress, amounts} = req.body;

        const url = `https://${config.subdomain}.versapay.com/api/v1/sessions/${sessionKey}/sales`;

        // Construir el payload de venta
        const payload = {
            currency: 'USD', // O dinámico
            billingAddress: billingAddress || {},
            shippingAddress: shippingAddress || {},
            lines: [], // Items del carrito
            shippingAmount: amounts.shipping || 0,
            discountAmount: amounts.discount || 0,
            taxAmount: amounts.tax || 0,
            payments: payments.map(p => ({
                type: p.payment_type,
                token: p.token,
                amount: parseFloat(p.amount),
                capture: p.payment_type !== 'creditCard', // Lógica del PHP
            })),
        };

        console.log('Procesando pago en Versapay:', url);
        const response = await axios.post(url, payload, {
            headers: {'Content-Type': 'application/json'},
        });

        res.json(response.data);
    } catch (error) {
        console.error('Error procesando pago:', error.response ? error.response.data : error.message);
        res.status(500).json({
            error: 'Payment processing failed',
            details: error.response ? error.response.data : null,
        });
    }
});

module.exports = app;
