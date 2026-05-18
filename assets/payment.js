(function(window) {
    const style = `
    .tp-modal-overlay {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.5); z-index: 9999;
        display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(4px);
    }
    .tp-modal {
        background: white; width: 90%; max-width: 400px;
        padding: 25px; border-radius: 12px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        font-family: 'Inter', sans-serif;
        animation: tp-slide-up 0.3s ease-out;
    }
    @keyframes tp-slide-up {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
    }
    .tp-header { margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 15px; }
    .tp-title { margin: 0; font-size: 1.25rem; color: #333; }
    .tp-amount { font-size: 1.5rem; font-weight: 700; color: #e67e22; margin-top: 5px; }
    .tp-desc { font-size: 0.95rem; color: #666; margin-top: 8px; }
    .tp-btn {
        width: 100%; padding: 12px; border: none; border-radius: 6px;
        font-size: 1rem; font-weight: 600; cursor: pointer;
        transition: background 0.2s; margin-top: 10px;
    }
    .tp-btn-pay { background: #e67e22; color: white; }
    .tp-btn-pay:hover { background: #d35400; }
    .tp-btn-cancel { background: transparent; color: #888; margin-top: 10px; }
    .tp-btn-cancel:hover { color: #555; }
    .tp-secure { 
        text-align: center; margin-top: 15px; font-size: 0.8rem; color: #888; 
        display: flex; align-items: center; justify-content: center; gap: 5px;
    }
    `;

    const html = `
    <div class="tp-modal-overlay">
        <div class="tp-modal">
            <div class="tp-header">
                <h3 class="tp-title">Complete Payment</h3>
                <div class="tp-amount" id="tp-amount-display">$0.00</div>
                <div class="tp-desc" id="tp-desc-display"></div>
            </div>
            <form id="tp-form">
                <button type="submit" class="tp-btn tp-btn-pay">Continue</button>
                <button type="button" class="tp-btn tp-btn-cancel" id="tp-cancel">Cancel</button>
            </form>
            <div class="tp-secure">
                <i class="fas fa-lock"></i> Secure Payment Processing
            </div>
        </div>
    </div>
    `;

    class TastyPayment {
        static request(amount, description) {
            return new Promise((resolve, reject) => {
                if (!document.getElementById('tp-style')) {
                    const styleEl = document.createElement('style');
                    styleEl.id = 'tp-style';
                    styleEl.textContent = style;
                    document.head.appendChild(styleEl);
                }

                const wrapper = document.createElement('div');
                wrapper.innerHTML = html;
                document.body.appendChild(wrapper);

                const overlay = wrapper.querySelector('.tp-modal-overlay');
                const form = wrapper.querySelector('#tp-form');
                const cancelBtn = wrapper.querySelector('#tp-cancel');
                
                wrapper.querySelector('#tp-amount-display').textContent = '$' + amount.toFixed(2);
                wrapper.querySelector('#tp-desc-display').textContent = description;

                const close = (success) => {
                    overlay.style.opacity = '0';
                    setTimeout(() => {
                        document.body.removeChild(wrapper);
                        if (success) resolve({ success: true, transactionId: 'TXN-' + Date.now() });
                        else reject(new Error('Payment Cancelled'));
                    }, 200);
                };

                form.onsubmit = (e) => {
                    e.preventDefault();
                    const payBtn = form.querySelector('.tp-btn-pay');
                    payBtn.textContent = 'Processing...';
                    payBtn.disabled = true;

                    setTimeout(() => {
                        close(true);
                    }, 1500);
                };

                cancelBtn.onclick = () => close(false);
                
                overlay.onclick = (e) => {
                    if (e.target === overlay) close(false);
                };
            });
        }
    }

    window.TastyPayment = TastyPayment;
})(window);
