// 1. Helper to get names of files already in the list (prevents duplicates)
const getFileNames = () => 
    Array.from(document.querySelectorAll('#fileList .file-card')).map(c => c.dataset.name);

// 2. Updates the UI (counters, total size, and button states)
function updateStats() {
    const cards = document.querySelectorAll('#fileList .file-card');
    const count = cards.length;
    
    const heading = document.getElementById('uploadHeading');
    const startBtn = document.getElementById('startBtn');
    const warn = document.getElementById('warnMsg');

    // Show 'Uploaded Files' title only if there are files
    if (heading) heading.classList.toggle('hidden', count === 0);
    
    document.getElementById('fileCount').textContent = count;
    
    let totalMB = 0;
    cards.forEach(card => totalMB += parseFloat(card.dataset.size || 0));
    document.getElementById('totalSize').textContent = totalMB.toFixed(1) + ' MB';

    // Fusion button requires at least 2 files
    if (startBtn) startBtn.disabled = count < 2;
    if (warn) warn.classList.toggle('hidden', count >= 2);
}

// 3. Removes a file when the 'X' is clicked
function removeFile(btn) {
    btn.closest('.file-card').remove();
    updateStats();
}

// 4. Creates the HTML structure for a file card
function createFileCard(name, sizeMB) {
    const card = document.createElement('div');
    card.className = 'file-card flex items-center gap-4 p-4 bg-white/[0.03] border border-white/[0.06] rounded-2xl animate-fade-up w-full';
    card.dataset.name = name;
    card.dataset.size = sizeMB;
    card.innerHTML = `
        <div class="w-10 h-10 rounded-xl bg-[#7c6fff]/15 flex items-center justify-center shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <div class="flex-1 min-w-0">
            <div class="text-[13px] font-medium text-zinc-200 truncate">${name}</div>
            <div class="text-[11px] text-zinc-600">${sizeMB} MB • PDF</div>
        </div>
        <button type="button" class="text-zinc-600 hover:text-red-400 transition-colors" onclick="removeFile(this)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>`;
    return card;
}

// 5. THE FUNCTION YOU PROVIDED: Manages the file addition logic
function handleFiles(fileList) {
    if (!fileList) return;
    const list = document.getElementById('fileList');
    const addBtn = document.getElementById('addMoreBtn');
    const existingNames = getFileNames();

    Array.from(fileList).forEach(file => {
        if (file.name.toLowerCase().endsWith('.pdf') && !existingNames.includes(file.name)) {
            const sizeMB = (file.size / 1048576).toFixed(1);
            const card = createFileCard(file.name, sizeMB);
            
            // This specifically keeps the "Add more" button at the bottom
            list.insertBefore(card, addBtn);
        }
    });

    updateStats();
    document.getElementById('fileInput').value = '';
}

// 6. Handles Drag and Drop
function handleDrop(e) {
    e.preventDefault();
    const dropZone = document.getElementById('dropZone');
    if (dropZone) dropZone.classList.remove('bg-[#7c6fff]/10');
    handleFiles(e.dataTransfer.files);
}

// 7. Initial setup
document.addEventListener('DOMContentLoaded', updateStats);