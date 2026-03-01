/**
 * LOGIN.JS - Sistema de autenticación administrativo v2.0
 * Con soporte para "Recordarme" y animaciones premium
 * Proyecto: Las Gambusinas
 */

const API_BASE = '/api';

// ============================================
// VERIFICACIÓN INICIAL DE TOKEN
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    // Verificar si hay token guardado
    const token = getStoredToken();
    
    if (token) {
        // Mostrar loader de verificación
        showVerificationLoader();
        
        const isValid = await verifyToken(token);
        
        if (isValid) {
            await animateLoginSuccess(() => {
                window.location.href = '/'; // Dashboard multipágina
            });
        } else {
            hideVerificationLoader();
            clearAuthStorage();
        }
    }
    
    // Inicializar animaciones del formulario
    initLoginAnimations();
    
    // Toggle mostrar/ocultar contraseña
    initPasswordToggle();
    
    // Manejar submit del formulario
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Inicializar checkbox recordarme
    initRecordarmeCheckbox();
});

// ============================================
// FUNCIONES DE STORAGE
// ============================================
function getStoredToken() {
    // Primero verificar localStorage (modo "Recordarme")
    const localToken = localStorage.getItem('adminToken');
    if (localToken) return localToken;
    
    // Luego verificar sessionStorage (modo normal)
    return sessionStorage.getItem('adminToken');
}

function saveToken(token, recordarme = false) {
    if (recordarme) {
        // Modo "Recordarme": guardar en localStorage
        localStorage.setItem('adminToken', token);
        localStorage.setItem('gambusinas_auth', 'true');
        localStorage.setItem('gambusinas_remember', 'true');
        
        // Guardar último usuario (solo el email parcial para UX)
        const username = document.getElementById('username')?.value;
        if (username) {
            localStorage.setItem('ultimoUsuario', username);
        }
        
        // Guardar preferencias UI por defecto
        if (!localStorage.getItem('preferenciasUI')) {
            localStorage.setItem('preferenciasUI', JSON.stringify({
                tema: 'dark',
                idioma: 'es',
                sidebarExpandido: true
            }));
        }
    } else {
        // Modo normal: guardar en sessionStorage (expira al cerrar pestaña)
        sessionStorage.setItem('adminToken', token);
        sessionStorage.setItem('gambusinas_auth', 'true');
        localStorage.removeItem('gambusinas_remember');
    }
}

function clearAuthStorage() {
    // Limpiar ambos storages pero mantener ultimoUsuario y preferencias
    localStorage.removeItem('adminToken');
    localStorage.removeItem('gambusinas_auth');
    localStorage.removeItem('gambusinas_remember');
    sessionStorage.removeItem('adminToken');
    sessionStorage.removeItem('gambusinas_auth');
}

function isRememberMeEnabled() {
    return localStorage.getItem('gambusinas_remember') === 'true';
}

// ============================================
// VERIFICACIÓN DE TOKEN
// ============================================
async function verifyToken(token) {
    try {
        const response = await fetch(`${API_BASE}/admin/verify`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return response.ok;
    } catch (error) {
        console.error('Error verificando token:', error);
        return false;
    }
}

// ============================================
// ANIMACIONES DE LOGIN
// ============================================
function initLoginAnimations() {
    const card = document.querySelector('.login-card');
    if (!card) return;
    
    // Añadir clases de animación inicial
    card.classList.add('animate__animated', 'animate__fadeInUp');
    
    // Animar inputs secuencialmente
    const inputs = document.querySelectorAll('.form-group');
    inputs.forEach((input, index) => {
        input.style.opacity = '0';
        input.style.transform = 'translateY(20px)';
        input.style.animationDelay = `${150 + index * 100}ms`;
        
        setTimeout(() => {
            input.style.transition = 'opacity 400ms ease-out, transform 400ms ease-out';
            input.style.opacity = '1';
            input.style.transform = 'translateY(0)';
        }, 150 + index * 100);
    });
    
    // Animar recordarme row
    const recordarmeRow = document.querySelector('.recordarme-row');
    if (recordarmeRow) {
        recordarmeRow.style.opacity = '0';
        setTimeout(() => {
            recordarmeRow.style.transition = 'opacity 400ms ease-out';
            recordarmeRow.style.opacity = '1';
        }, 450);
    }
    
    // Animar botón
    const btn = document.querySelector('.btn-login');
    if (btn) {
        btn.style.opacity = '0';
        btn.style.transform = 'translateY(20px)';
        setTimeout(() => {
            btn.style.transition = 'opacity 400ms ease-out, transform 400ms ease-out';
            btn.style.opacity = '1';
            btn.style.transform = 'translateY(0)';
        }, 550);
    }
    
    // Animar footer
    const footerText = document.querySelector('.footer-text');
    const version = document.querySelector('.version');
    [footerText, version].forEach((el, i) => {
        if (el) {
            el.style.opacity = '0';
            setTimeout(() => {
                el.style.transition = 'opacity 400ms ease-out';
                el.style.opacity = '1';
            }, 650 + i * 100);
        }
    });
}

function initPasswordToggle() {
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
                
                // Añadir animación al icono
                icon.style.transform = 'scale(1.3)';
                icon.style.transition = 'transform 0.15s ease-out';
                setTimeout(() => icon.style.transform = '', 150);
            }
        });
    }
}

function initRecordarmeCheckbox() {
    const checkbox = document.getElementById('recordarme');
    const usernameInput = document.getElementById('username');
    
    // Restaurar último usuario si existe
    const ultimoUsuario = localStorage.getItem('ultimoUsuario');
    if (ultimoUsuario && usernameInput) {
        usernameInput.value = ultimoUsuario;
        
        // Marcar checkbox si estaba activado
        if (isRememberMeEnabled() && checkbox) {
            checkbox.checked = true;
        }
    }
    
    // Añadir animación al cambiar checkbox
    if (checkbox) {
        checkbox.addEventListener('change', () => {
            const customCheck = checkbox.nextElementSibling;
            if (customCheck) {
                customCheck.style.transform = 'scale(1.2)';
                setTimeout(() => {
                    customCheck.style.transform = '';
                }, 150);
            }
        });
    }
}

function showVerificationLoader() {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.style.display = 'flex';
        loading.classList.add('animate__animated', 'animate__fadeIn');
    }
}

function hideVerificationLoader() {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.classList.add('animate__animated', 'animate__fadeOut');
        setTimeout(() => {
            loading.style.display = 'none';
            loading.classList.remove('animate__animated', 'animate__fadeOut');
        }, 300);
    }
}

async function animateLoginError(message) {
    const loginCard = document.querySelector('.login-card');
    const errorDiv = document.getElementById('loginError');
    
    // Shake animation
    if (loginCard) {
        loginCard.classList.add('shake-error');
        setTimeout(() => loginCard.classList.remove('shake-error'), 500);
    }
    
    // Mostrar mensaje de error
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.className = 'alert-login alert-error show animate__animated animate__fadeIn';
    }
}

async function animateLoginSuccess(callback) {
    const loginCard = document.querySelector('.login-card');
    const loading = document.getElementById('loading');
    
    // Fade out del formulario
    if (loginCard) {
        loginCard.classList.add('success-fade-out');
    }
    
    // Mostrar loader de éxito
    if (loading) {
        loading.style.display = 'flex';
        loading.classList.add('animate__animated', 'animate__fadeIn');
    }
    
    // Ejecutar callback después de animación
    setTimeout(callback, 800);
}

// ============================================
// HANDLER DE LOGIN
// ============================================
async function handleLogin(event) {
    event.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const recordarme = document.getElementById('recordarme')?.checked || false;
    const btnLogin = document.getElementById('btnLogin');
    const btnText = document.getElementById('btnText');
    const btnLoader = document.getElementById('btnLoader');
    const loginError = document.getElementById('loginError');
    
    // Validar campos
    if (!username || !password) {
        animateLoginError('Por favor complete todos los campos');
        return;
    }
    
    // Mostrar loader en botón
    btnLogin.disabled = true;
    btnText.style.opacity = '0';
    btnLoader.classList.add('active');
    loginError.classList.remove('show');
    
    // Añadir clase de animación al botón
    btnLogin.style.transform = 'scale(0.98)';
    
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
        
        // Guardar token según modo
        saveToken(data.token, recordarme);
        
        // Animación de éxito y redirección
        await animateLoginSuccess(() => {
            window.location.href = '/';
        });
        
    } catch (error) {
        console.error('Error en login:', error);
        
        let errorMessage = 'Error de conexión. Verifique sus credenciales.';
        
        if (error.message) {
            errorMessage = error.message;
        } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
            errorMessage = 'Error de conexión con el servidor. Verifique su conexión a internet.';
        }
        
        animateLoginError(errorMessage);
        
        // Restaurar botón
        btnLogin.disabled = false;
        btnLogin.style.transform = '';
        btnText.style.opacity = '1';
        btnLoader.classList.remove('active');
    }
}

// ============================================
// LOGOUT (para usar desde cualquier página)
// ============================================
function logout() {
    clearAuthStorage();
    
    // Animación de salida
    document.body.style.transition = 'opacity 300ms ease-out';
    document.body.style.opacity = '0';
    
    setTimeout(() => {
        window.location.href = '/login';
    }, 300);
}

// Exportar función de logout para uso global
window.logout = logout;
