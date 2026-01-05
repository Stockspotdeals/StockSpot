// StockSpot Dashboard JavaScript
// Handles interactive dashboard functionality

document.addEventListener('DOMContentLoaded', function() {
    // Initialize dashboard components
    initializeComponents();
    setupEventListeners();
    startPeriodicUpdates();
    
    // Show welcome animation
    animateElements();
});

// Initialize dashboard components
function initializeComponents() {
    console.log('🚀 StockSpot Dashboard initialized');
    
    // Initialize tooltips
    initializeTooltips();
    
    // Initialize modals
    initializeModals();
    
    // Initialize charts (if chart library is loaded)
    if (typeof Chart !== 'undefined') {
        initializeCharts();
    }
    
    // Initialize form validation
    initializeFormValidation();
}

// Setup event listeners
function setupEventListeners() {
    // Navigation
    setupNavigation();
    
    // Buttons
    setupButtonHandlers();
    
    // Forms
    setupFormHandlers();
    
    // Queue management
    setupQueueHandlers();
    
    // Settings
    setupSettingsHandlers();
}

// Navigation handlers
function setupNavigation() {
    const navLinks = document.querySelectorAll('[data-nav]');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            // Add active state styling
            document.querySelectorAll('[data-nav]').forEach(l => l.classList.remove('bg-blue-100', 'text-blue-700'));
            this.classList.add('bg-blue-100', 'text-blue-700');
        });
    });
}

// Button handlers
function setupButtonHandlers() {
    // Refresh buttons
    document.querySelectorAll('[data-action="refresh"]').forEach(btn => {
        btn.addEventListener('click', function() {
            const section = this.getAttribute('data-section');
            refreshSection(section);
        });
    });
    
    // Process queue button
    const processQueueBtn = document.querySelector('[data-action="process-queue"]');
    if (processQueueBtn) {
        processQueueBtn.addEventListener('click', processQueue);
    }
    
    // Clear queue button
    const clearQueueBtn = document.querySelector('[data-action="clear-queue"]');
    if (clearQueueBtn) {
        clearQueueBtn.addEventListener('click', clearQueue);
    }
    
    // Export data button
    const exportBtn = document.querySelector('[data-action="export"]');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportData);
    }
}

// Form handlers
function setupFormHandlers() {
    // Settings form
    const settingsForm = document.querySelector('#settings-form');
    if (settingsForm) {
        settingsForm.addEventListener('submit', handleSettingsSubmit);
    }
    
    // Manual post form
    const manualPostForm = document.querySelector('#manual-post-form');
    if (manualPostForm) {
        manualPostForm.addEventListener('submit', handleManualPost);
    }
}

// Queue management handlers
function setupQueueHandlers() {
    // Delete queue item buttons
    document.querySelectorAll('[data-action="delete-queue-item"]').forEach(btn => {
        btn.addEventListener('click', function() {
            const itemId = this.getAttribute('data-item-id');
            deleteQueueItem(itemId);
        });
    });
    
    // Edit queue item buttons
    document.querySelectorAll('[data-action="edit-queue-item"]').forEach(btn => {
        btn.addEventListener('click', function() {
            const itemId = this.getAttribute('data-item-id');
            editQueueItem(itemId);
        });
    });
}

// Settings handlers
function setupSettingsHandlers() {
    // Test API connection buttons
    document.querySelectorAll('[data-action="test-api"]').forEach(btn => {
        btn.addEventListener('click', function() {
            const apiType = this.getAttribute('data-api');
            testAPIConnection(apiType);
        });
    });
    
    // Reset settings button
    const resetBtn = document.querySelector('[data-action="reset-settings"]');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetSettings);
    }
}

// Refresh section data
async function refreshSection(section) {
    const refreshBtn = document.querySelector(`[data-action="refresh"][data-section="${section}"]`);
    const originalText = refreshBtn.innerHTML;
    
    // Show loading state
    refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Refreshing...';
    refreshBtn.disabled = true;
    
    try {
        const response = await fetch(`/api/refresh/${section}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            updateSectionData(section, data);
            showNotification('success', `${section} data refreshed successfully!`);
            
            // Reload page to show updated data
            setTimeout(() => window.location.reload(), 1000);
        } else {
            throw new Error('Failed to refresh data');
        }
    } catch (error) {
        console.error('Refresh error:', error);
        showNotification('error', 'Failed to refresh data. Please try again.');
    } finally {
        // Restore button state
        refreshBtn.innerHTML = originalText;
        refreshBtn.disabled = false;
    }
}

// Process queue
async function processQueue() {
    const processBtn = document.querySelector('[data-action="process-queue"]');
    const originalText = processBtn.innerHTML;
    
    // Show loading state
    processBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Processing...';
    processBtn.disabled = true;
    
    try {
        const response = await fetch('/api/process-queue', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            showNotification('success', `Queue processed! ${data.processed} items posted.`);
            
            // Reload page to show updated queue
            setTimeout(() => window.location.reload(), 1500);
        } else {
            throw new Error('Failed to process queue');
        }
    } catch (error) {
        console.error('Process queue error:', error);
        showNotification('error', 'Failed to process queue. Please try again.');
    } finally {
        // Restore button state
        processBtn.innerHTML = originalText;
        processBtn.disabled = false;
    }
}

// Clear queue
async function clearQueue() {
    if (!confirm('Are you sure you want to clear the entire queue? This cannot be undone.')) {
        return;
    }
    
    try {
        const response = await fetch('/api/clear-queue', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (response.ok) {
            showNotification('success', 'Queue cleared successfully!');
            setTimeout(() => window.location.reload(), 1000);
        } else {
            throw new Error('Failed to clear queue');
        }
    } catch (error) {
        console.error('Clear queue error:', error);
        showNotification('error', 'Failed to clear queue. Please try again.');
    }
}

// Delete queue item
async function deleteQueueItem(itemId) {
    if (!confirm('Are you sure you want to delete this item?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/queue/${itemId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (response.ok) {
            // Remove item from DOM
            const itemElement = document.querySelector(`[data-item-id="${itemId}"]`).closest('.queue-item');
            itemElement.remove();
            showNotification('success', 'Item deleted successfully!');
        } else {
            throw new Error('Failed to delete item');
        }
    } catch (error) {
        console.error('Delete item error:', error);
        showNotification('error', 'Failed to delete item. Please try again.');
    }
}

// Test API connection
async function testAPIConnection(apiType) {
    const testBtn = document.querySelector(`[data-action="test-api"][data-api="${apiType}"]`);
    const originalText = testBtn.innerHTML;
    
    // Show loading state
    testBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Testing...';
    testBtn.disabled = true;
    
    try {
        const response = await fetch(`/api/test/${apiType}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('success', `${apiType} connection successful!`);
        } else {
            showNotification('error', `${apiType} connection failed: ${data.error}`);
        }
    } catch (error) {
        console.error('API test error:', error);
        showNotification('error', `Failed to test ${apiType} connection.`);
    } finally {
        // Restore button state
        testBtn.innerHTML = originalText;
        testBtn.disabled = false;
    }
}

// Handle settings form submission
async function handleSettingsSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const settings = Object.fromEntries(formData.entries());
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    
    // Show loading state
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Saving...';
    submitBtn.disabled = true;
    
    try {
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(settings)
        });
        
        if (response.ok) {
            showNotification('success', 'Settings saved successfully!');
        } else {
            throw new Error('Failed to save settings');
        }
    } catch (error) {
        console.error('Settings save error:', error);
        showNotification('error', 'Failed to save settings. Please try again.');
    } finally {
        // Restore button state
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// Show notification
function showNotification(type, message) {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 animate-slide-in ${
        type === 'success' ? 'bg-green-500 text-white' : 
        type === 'error' ? 'bg-red-500 text-white' : 
        'bg-blue-500 text-white'
    }`;
    
    notification.innerHTML = `
        <div class="flex items-center">
            <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'exclamation-triangle' : 'info'} mr-2"></i>
            <span>${message}</span>
            <button class="ml-4 text-white hover:text-gray-200" onclick="this.parentElement.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    // Add to page
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// Initialize tooltips
function initializeTooltips() {
    const tooltipTriggers = document.querySelectorAll('[data-tooltip]');
    tooltipTriggers.forEach(trigger => {
        trigger.addEventListener('mouseenter', showTooltip);
        trigger.addEventListener('mouseleave', hideTooltip);
    });
}

// Show tooltip
function showTooltip(e) {
    const trigger = e.target;
    const text = trigger.getAttribute('data-tooltip');
    
    const tooltip = document.createElement('div');
    tooltip.className = 'absolute bg-gray-800 text-white px-2 py-1 rounded text-sm z-50 pointer-events-none';
    tooltip.textContent = text;
    tooltip.id = 'tooltip';
    
    document.body.appendChild(tooltip);
    
    // Position tooltip
    const rect = trigger.getBoundingClientRect();
    tooltip.style.left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2) + 'px';
    tooltip.style.top = rect.top - tooltip.offsetHeight - 8 + 'px';
}

// Hide tooltip
function hideTooltip() {
    const tooltip = document.getElementById('tooltip');
    if (tooltip) {
        tooltip.remove();
    }
}

// Initialize modals
function initializeModals() {
    // Modal triggers
    document.querySelectorAll('[data-modal]').forEach(trigger => {
        trigger.addEventListener('click', function() {
            const modalId = this.getAttribute('data-modal');
            showModal(modalId);
        });
    });
    
    // Modal close buttons
    document.querySelectorAll('[data-modal-close]').forEach(btn => {
        btn.addEventListener('click', hideModal);
    });
    
    // Click outside to close
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal-backdrop')) {
            hideModal();
        }
    });
}

// Show modal
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

// Hide modal
function hideModal() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    });
}

// Initialize form validation
function initializeFormValidation() {
    const forms = document.querySelectorAll('form[data-validate]');
    forms.forEach(form => {
        form.addEventListener('submit', validateForm);
    });
}

// Validate form
function validateForm(e) {
    const form = e.target;
    const requiredFields = form.querySelectorAll('[required]');
    let isValid = true;
    
    requiredFields.forEach(field => {
        if (!field.value.trim()) {
            field.classList.add('border-red-500');
            isValid = false;
        } else {
            field.classList.remove('border-red-500');
        }
    });
    
    if (!isValid) {
        e.preventDefault();
        showNotification('error', 'Please fill in all required fields.');
    }
}

// Animate elements on load
function animateElements() {
    const elements = document.querySelectorAll('.animate-on-load');
    elements.forEach((element, index) => {
        setTimeout(() => {
            element.classList.add('animate-fade-in');
        }, index * 100);
    });
}

// Start periodic updates
function startPeriodicUpdates() {
    // Update stats every 30 seconds
    setInterval(updateStats, 30000);
    
    // Update queue status every 10 seconds
    setInterval(updateQueueStatus, 10000);
}

// Update stats
async function updateStats() {
    try {
        const response = await fetch('/api/stats');
        if (response.ok) {
            const stats = await response.json();
            updateStatsDisplay(stats);
        }
    } catch (error) {
        console.error('Stats update error:', error);
    }
}

// Update stats display
function updateStatsDisplay(stats) {
    // Update total posts
    const totalPostsElement = document.querySelector('[data-stat="total-posts"]');
    if (totalPostsElement) {
        totalPostsElement.textContent = stats.total_posts || 0;
    }
    
    // Update queue size
    const queueSizeElement = document.querySelector('[data-stat="queue-size"]');
    if (queueSizeElement) {
        queueSizeElement.textContent = stats.queue_size || 0;
    }
    
    // Update success rate
    const successRateElement = document.querySelector('[data-stat="success-rate"]');
    if (successRateElement) {
        successRateElement.textContent = (stats.success_rate || 0) + '%';
    }
}

// Update queue status
async function updateQueueStatus() {
    try {
        const response = await fetch('/api/queue/status');
        if (response.ok) {
            const status = await response.json();
            updateQueueStatusDisplay(status);
        }
    } catch (error) {
        console.error('Queue status update error:', error);
    }
}

// Update queue status display
function updateQueueStatusDisplay(status) {
    const statusElement = document.querySelector('[data-queue-status]');
    if (statusElement) {
        statusElement.textContent = status.message || 'Ready';
        statusElement.className = `px-2 py-1 rounded text-sm ${
            status.type === 'processing' ? 'bg-yellow-100 text-yellow-800' :
            status.type === 'success' ? 'bg-green-100 text-green-800' :
            status.type === 'error' ? 'bg-red-100 text-red-800' :
            'bg-gray-100 text-gray-800'
        }`;
    }
}

// Export data
async function exportData() {
    try {
        const response = await fetch('/api/export', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `stockspot-export-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            showNotification('success', 'Data exported successfully!');
        } else {
            throw new Error('Export failed');
        }
    } catch (error) {
        console.error('Export error:', error);
        showNotification('error', 'Failed to export data. Please try again.');
    }
}

// Utility functions
function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatNumber(num) {
    return new Intl.NumberFormat().format(num);
}

function truncateText(text, maxLength = 100) {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

// Debug helpers
function debugLog(message, data = null) {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log(`[StockSpot] ${message}`, data);
    }
}

// Global error handler
window.addEventListener('error', function(e) {
    console.error('Global error:', e.error);
    debugLog('Global error occurred', e.error);
});

// Expose utilities globally for debugging
window.StockSpot = {
    refreshSection,
    processQueue,
    clearQueue,
    showNotification,
    updateStats,
    debugLog,
    formatDate,
    formatNumber,
    truncateText
};