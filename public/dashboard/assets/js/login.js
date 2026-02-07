/**
 * LOGIN.JS - Sistema de autenticación administrativo
 */

const API_BASE = '/api';

document.addEventListener('DOMContentLoaded', () => {
    // Verificar si ya está autenticado
    const token = localStorage.getItem('adminToken');
    if (token) {
        // Verificar token válido
        fetch(`${API_BASE}/admin/verify`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        .then(response => {
            if (response.ok) {
                window.location.href = '/dashboard';
            }
        })
        .catch(() => {
            localStorage.removeItem('adminToken');
        });
    }
    
    // Toggle mostrar/ocultar contraseña
    const togglePassword = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');
    
    if (togglePassword && passwordInput) {
        togglePassword.addEventListener('click', () => {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            
            const icon = togglePassword.querySelector('i');
            if (icon) {
                icon.classList.toggle('la-eye');
                icon.classList.toggle('la-eye-slash');
            }
        });
    }
    
    // Manejar submit del formulario
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
});

async function handleLogin(event) {
    event.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const btnLogin = document.getElementById('btnLogin');
    const btnText = document.getElementById('btnText');
    const btnLoader = document.getElementById('btnLoader');
    const loginError = document.getElementById('loginError');
    
    // Validar campos
    if (!username || !password) {
        showError('Por favor complete todos los campos');
        return;
    }
    
    // Mostrar loader
    btnLogin.disabled = true;
    btnText.style.opacity = '0';
    btnLoader.classList.add('active');
    loginError.classList.remove('show');
    
    try {
        const response = await fetch(`${API_BASE}/admin/auth`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Error de autenticación');
        }
        
        // Guardar token
        localStorage.setItem('adminToken', data.token);
        
        // Mostrar loader SVG Aprycot
        const mainLoader = document.getElementById('loading');
        if (mainLoader) {
            mainLoader.style.display = 'flex';
        }
        
        // Redirigir después de breve delay
        setTimeout(() => {
            window.location.href = '/dashboard';
        }, 1000);
        
    } catch (error) {
        console.error('Error en login:', error);
        let errorMessage = 'Error de conexión. Verifique sus credenciales.';
        
        if (error.message) {
            errorMessage = error.message;
        } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
            errorMessage = 'Error de conexión con el servidor. Verifique su conexión a internet.';
        }
        
        showError(errorMessage);
        
        // Ocultar loader
        btnLogin.disabled = false;
        if (btnText) btnText.style.opacity = '1';
        if (btnLoader) btnLoader.classList.remove('active');
    }
}

function showError(message) {
    const loginError = document.getElementById('loginError');
    if (loginError) {
        loginError.textContent = message;
        loginError.className = 'alert alert-login alert-error show';
    }
}

