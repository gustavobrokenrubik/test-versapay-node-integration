document.addEventListener('DOMContentLoaded', async () => {
    const placeOrderBtn = document.getElementById('place_order');
    const errorMessageEl = document.getElementById('error-message');
    const cartTotal = document.getElementById('cart-total').value;

    let client;
    let clientOnApprovalFirstRun = true;
    let sessionKey;
    let subdomain;

    // Función auxiliar para cargar script dinámicamente
    const loadScript = (src) => {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.body.appendChild(script);
        });
    };

    try {
        // 1. Obtener Configuración y Session Key
        const [configRes, sessionRes] = await Promise.all([
            fetch('/api/config'),
            fetch('/api/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderTotal: cartTotal })
            })
        ]);

        const config = await configRes.json();
        const sessionData = await sessionRes.json();

        if (sessionData.error) throw new Error(sessionData.error);

        sessionKey = sessionData.sessionKey;
        subdomain = config.subdomain;

        console.log(`Config loaded: ${subdomain}, Session: ${sessionKey}`);

        // 2. Cargar SDK de Versapay dinámicamente
        // Esto asegura que el cliente coincida con el entorno del servidor (sandbox vs uat)
        const sdkUrl = `https://${subdomain}.versapay.com/client.js`;
        await loadScript(sdkUrl);
        console.log('Versapay SDK loaded from', sdkUrl);

    } catch (err) {
        errorMessageEl.textContent = "Error initializing payment: " + err.message;
        console.error(err);
        return;
    }

    if (typeof versapay === 'undefined') {
        errorMessageEl.textContent = "Versapay SDK failed to load";
        return;
    }

    // 3. Inicializar Cliente Versapay
    const styles = {
       html: {
            'font-family': 'Karla, Arial, Helvetica, sans-serif',
            'font-size': '13px',
        },
        h1: {
            'display': 'none',
            'visibility': 'hidden',
            'font-size': '0',
        },
        'label.form-label': {
            'font-size': '14px',
        },
        input: {
            'font-size': '13px',
            'color': '#333',
            'height': '44px',
            'line-height': '22px',
        },
        select: {
            'font-size': '13px',
            'color': '#333',
            'height': '44px',
            'line-height': '22px',
        },
        '.form-error': {
            'font-size': '12px',
            'line-height': '12px',
        },
        '.form-div-half': {
            'margin-bottom': '15px',
        },
        '.form-div-full': {
            'margin-bottom': '15px',
        },
        '#accountNo': {
            'padding-left': 'calc(2rem + 20px)',
        },
    };

    const fontUrls = ['https://fonts.googleapis.com/css?family=Montserrat:400%7COswald:300%7CKarla:400&display=swap'];

    client = versapay.initClient(sessionKey, styles, fontUrls);

    // 4. Inicializar Iframe
    const container = document.getElementById('versapay-container');
    const docWidth = container.clientWidth;

    try {
        await client.initFrame(container, '300px', `${docWidth}px`);
        console.log('Versapay Frame Ready');
        placeOrderBtn.disabled = false;

        // Manejar evento de click en "Place Order"
        placeOrderBtn.addEventListener('click', (e) => {
            if (clientOnApprovalFirstRun) {
                e.preventDefault();
                placeOrderBtn.disabled = true;
                client.submitEvents(); // Esto dispara la validación en el iframe
            } else {
                console.log("Already approved");
            }
        });

        // Configurar callbacks
        client.onPartialPayment(
            (result) => {
                placeOrderBtn.disabled = false;
                console.log('Partial payment:', result);
            },
            (error) => {
                errorMessageEl.textContent = 'Payment error: ' + error.message;
                placeOrderBtn.disabled = false;
            }
        );

        client.onApproval(
            async (result) => {
                clientOnApprovalFirstRun = false;
                errorMessageEl.textContent = "";

                console.log('Payment Approved by Iframe:', result);

                // Construir array de pagos
                let payments = [];
                if (result.partialPayments) {
                    payments = result.partialPayments.map(p => ({
                        token: p.token,
                        payment_type: p.paymentTypeName,
                        amount: p.amount ?? 0.0
                    }));
                }
                payments.push({
                    token: result.token,
                    payment_type: result.paymentTypeName,
                    amount: result.amount ?? 0.0
                });

                // 5. Enviar al Backend para procesar la venta
                await processPaymentOnBackend(payments);
            },
            (error) => {
                clientOnApprovalFirstRun = true;
                errorMessageEl.textContent = 'Approval error: ' + (error.message || JSON.stringify(error));
                placeOrderBtn.disabled = false;
            }
        );

    } catch (err) {
        console.error("Error initializing frame", err);
        errorMessageEl.textContent = "Failed to load payment form";
    }

    async function processPaymentOnBackend(payments) {
        const billingData = {
            contactFirstName: document.getElementById('billing_name').value,
            contactLastName: document.getElementById('billing_last_name').value,
            email: document.getElementById('billing_email').value
        };

        try {
            const response = await fetch('/api/process-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionKey: sessionKey,
                    payments: payments,
                    billingAddress: billingData,
                    amounts: {
                        shipping: 0,
                        discount: 0,
                        tax: 0
                    }
                })
            });

            const result = await response.json();

            if (result.orderId) {
                alert('Order Placed Successfully! Order ID: ' + result.orderId);
                // Aquí podrías redirigir a una página de éxito
            } else {
                throw new Error('Payment processed but no Order ID returned');
            }

        } catch (err) {
            console.error(err);
            errorMessageEl.textContent = "Backend processing failed: " + err.message;
            placeOrderBtn.disabled = false;
            clientOnApprovalFirstRun = true;
        }
    }
});
