/**
 * Las Gambusinas - SEO Meta Tags Manager
 * Gestión dinámica de meta tags, Open Graph y Twitter Cards
 * 
 * Este script obtiene la configuración SEO desde la API y actualiza
 * los meta tags del documento en tiempo real.
 */

(function() {
    'use strict';
    
    // Configuración SEO por defecto (fallback)
    const DEFAULT_SEO = {
        metaTitle: 'Las Gambusinas - Sistema POS',
        metaDescription: 'Sistema de punto de venta para gestión de restaurante. Control de mesas, comandas, pedidos y más.',
        canonicalUrl: '',
        ogTitle: 'Las Gambusinas - Restaurante',
        ogDescription: 'Sistema de gestión integral para restaurantes. Control de mesas, comandas y pedidos en tiempo real.',
        ogImage: '',
        ogUrl: '',
        ogType: 'website',
        twitterCard: 'summary_large_image',
        twitterSite: '',
        twitterTitle: 'Las Gambusinas - Sistema POS',
        twitterDescription: 'Sistema de punto de venta para gestión de restaurante',
        twitterImage: ''
    };
    
    // Cache local para SEO (5 minutos)
    const SEO_CACHE_KEY = 'gambusinas_seo_cache';
    const SEO_CACHE_TTL = 5 * 60 * 1000; // 5 minutos en ms
    
    /**
     * Obtiene la configuración SEO desde el cache local o la API
     */
    async function getSEOConfig() {
        // Intentar obtener del cache local
        const cached = localStorage.getItem(SEO_CACHE_KEY);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                if (parsed.timestamp && (Date.now() - parsed.timestamp < SEO_CACHE_TTL)) {
                    return { ...DEFAULT_SEO, ...parsed.data };
                }
            } catch (e) {
                console.warn('[SEO] Error parsing cache:', e);
            }
        }
        
        // Obtener de la API
        try {
            const token = localStorage.getItem('adminToken') || sessionStorage.getItem('adminToken');
            const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
            
            const response = await fetch('/api/configuracion', { headers });
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.configuracion && data.configuracion.seo) {
                    const seoData = { ...DEFAULT_SEO, ...data.configuracion.seo };
                    
                    // Guardar en cache
                    localStorage.setItem(SEO_CACHE_KEY, JSON.stringify({
                        timestamp: Date.now(),
                        data: seoData
                    }));
                    
                    return seoData;
                }
            }
        } catch (e) {
            console.warn('[SEO] Error fetching config:', e);
        }
        
        return DEFAULT_SEO;
    }
    
    /**
     * Crea o actualiza un meta tag
     */
    function setMetaTag(selector, attribute, value, tagName = 'meta') {
        if (!value) return;
        
        let element = document.querySelector(selector);
        
        if (!element) {
            element = document.createElement(tagName);
            const attrName = selector.match(/\[([^\]]+)\]/)?.[1]?.split('=')[0];
            const attrValue = selector.match(/\[([^\]]+)="([^"]+)"\]/)?.[2];
            if (attrName && attrValue) {
                element.setAttribute(attrName, attrValue);
            }
            document.head.appendChild(element);
        }
        
        element.setAttribute(attribute, value);
    }
    
    /**
     * Crea o actualiza un link tag (para canonical)
     */
    function setLinkTag(rel, href) {
        if (!href) return;
        
        let element = document.querySelector(`link[rel="${rel}"]`);
        
        if (!element) {
            element = document.createElement('link');
            element.setAttribute('rel', rel);
            document.head.appendChild(element);
        }
        
        element.setAttribute('href', href);
    }
    
    /**
     * Actualiza el título de la página
     */
    function updateTitle(title) {
        if (title) {
            document.title = title;
            // También actualizar el og:title si no hay uno específico
            setMetaTag('meta[property="og:title"]', 'content', title);
        }
    }
    
    /**
     * Aplica todos los meta tags SEO
     */
    function applySEOTags(config) {
        // Meta tags básicos
        updateTitle(config.metaTitle);
        setMetaTag('meta[name="description"]', 'content', config.metaDescription);
        
        // Canonical URL
        if (config.canonicalUrl) {
            setLinkTag('canonical', config.canonicalUrl);
        } else {
            // Usar la URL actual como canonical por defecto
            setLinkTag('canonical', window.location.href.split('?')[0].split('#')[0]);
        }
        
        // Open Graph tags
        setMetaTag('meta[property="og:title"]', 'content', config.ogTitle || config.metaTitle);
        setMetaTag('meta[property="og:description"]', 'content', config.ogDescription || config.metaDescription);
        setMetaTag('meta[property="og:url"]', 'content', config.ogUrl || window.location.href.split('?')[0].split('#')[0]);
        setMetaTag('meta[property="og:type"]', 'content', config.ogType || 'website');
        setMetaTag('meta[property="og:site_name"]', 'content', 'Las Gambusinas');
        
        if (config.ogImage) {
            setMetaTag('meta[property="og:image"]', 'content', config.ogImage);
            setMetaTag('meta[property="og:image:alt"]', 'content', config.ogTitle || 'Las Gambusinas');
        }
        
        // Twitter Card tags
        setMetaTag('meta[name="twitter:card"]', 'content', config.twitterCard || 'summary_large_image');
        setMetaTag('meta[name="twitter:title"]', 'content', config.twitterTitle || config.ogTitle || config.metaTitle);
        setMetaTag('meta[name="twitter:description"]', 'content', config.twitterDescription || config.ogDescription || config.metaDescription);
        
        if (config.twitterSite) {
            setMetaTag('meta[name="twitter:site"]', 'content', config.twitterSite);
        }
        
        if (config.twitterImage || config.ogImage) {
            setMetaTag('meta[name="twitter:image"]', 'content', config.twitterImage || config.ogImage);
        }
        
        // Locale
        setMetaTag('meta[property="og:locale"]', 'content', 'es_PE');
        
        console.log('[SEO] Meta tags actualizados correctamente');
    }
    
    /**
     * Función principal de inicialización
     */
    async function initSEO() {
        try {
            const seoConfig = await getSEOConfig();
            applySEOTags(seoConfig);
        } catch (e) {
            console.warn('[SEO] Error initializing:', e);
            applySEOTags(DEFAULT_SEO);
        }
    }
    
    /**
     * Invalida el cache SEO (llamar cuando se actualiza la configuración)
     */
    function invalidateSEOCache() {
        localStorage.removeItem(SEO_CACHE_KEY);
        console.log('[SEO] Cache invalidado');
    }
    
    /**
     * Fuerza la recarga de la configuración SEO
     */
    async function refreshSEO() {
        invalidateSEOCache();
        await initSEO();
    }
    
    // Exponer funciones globalmente
    window.SEOMeta = {
        init: initSEO,
        refresh: refreshSEO,
        invalidateCache: invalidateSEOCache,
        applyTags: applySEOTags,
        getDefaults: () => ({ ...DEFAULT_SEO })
    };
    
    // Inicializar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSEO);
    } else {
        initSEO();
    }
    
})();
