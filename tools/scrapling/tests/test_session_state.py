"""Testes offline do estado de sessao (perfil persistente + verificacao de login)."""
from __future__ import annotations

import sqlite3
from pathlib import Path

from session_state import (
    LOCK_ARTIFACTS,
    SHOPEE_AUTH_COOKIE,
    _command_line_targets_profile,
    _normalize_dir,
    is_cookie_live,
    login_args,
    read_auth_state,
    resolve_chrome_path,
)


def _make_cookie_db(profile: Path, rows: list[tuple[str, str, int]]) -> Path:
    """Cria um `Default/Network/Cookies` com as linhas informadas."""
    db_dir = profile / "Default" / "Network"
    db_dir.mkdir(parents=True, exist_ok=True)
    db_path = db_dir / "Cookies"
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            "CREATE TABLE cookies (host_key TEXT, name TEXT, expires_utc INTEGER)"
        )
        conn.executemany("INSERT INTO cookies VALUES (?, ?, ?)", rows)
        conn.commit()
    finally:
        conn.close()
    return db_path


# --- resolve_chrome_path --------------------------------------------------------


def test_shopee_chrome_path_tem_prioridade_absoluta(tmp_path):
    fake = tmp_path / "chrome.exe"
    fake.write_bytes(b"")
    resolved = resolve_chrome_path(
        {"SHOPEE_CHROME_PATH": str(fake), "PROGRAMFILES": r"C:\nao-existe"}
    )
    assert resolved == str(fake)


def test_shopee_chrome_path_invalido_nao_cai_no_chrome_do_sistema(tmp_path):
    """Override apontando para arquivo inexistente precisa virar None, n├úo um
    fallback silencioso para outro Chrome ÔÇö sen├úo o driver abre um navegador
    diferente do que a pessoa configurou."""
    assert (
        resolve_chrome_path(
            {"SHOPEE_CHROME_PATH": str(tmp_path / "nao-existe.exe"), "PROGRAMFILES": str(tmp_path)}
        )
        is None
    )


def test_program_files_tem_prioridade_sobre_local_app_data(tmp_path):
    system = tmp_path / "programfiles" / "Google" / "Chrome" / "Application"
    user = tmp_path / "localappdata" / "Google" / "Chrome" / "Application"
    system.mkdir(parents=True)
    user.mkdir(parents=True)
    (system / "chrome.exe").write_bytes(b"")
    (user / "chrome.exe").write_bytes(b"")

    resolved = resolve_chrome_path(
        {
            "PROGRAMFILES": str(tmp_path / "programfiles"),
            "LOCALAPPDATA": str(tmp_path / "localappdata"),
        }
    )
    assert resolved == str(system / "chrome.exe")


def test_sem_nenhuma_var_de_ambiente_devolve_none():
    assert resolve_chrome_path({}) is None


# --- login_args -----------------------------------------------------------------


def test_login_args_nao_carrega_nenhuma_flag_de_automacao(tmp_path):
    """A lista ├® o ponto que garante o login: se uma flag de automa├º├úo voltar aqui
    (--enable-automation, --remote-debugging-port, --headless,
    --disable-blink-features=AutomationControlled), o modal de telefone volta a
    travar em loading infinito."""
    args = login_args(tmp_path / ".shopee_profile", "https://shopee.com.br/login")
    joined = " ".join(args)

    assert f"--user-data-dir={tmp_path / '.shopee_profile'}" in args
    assert args[-1] == "https://shopee.com.br/login"

    for forbidden in (
        "--enable-automation",
        "--remote-debugging-port",
        "--headless",
        "--disable-blink-features",
        "--no-sandbox",
        "--test-type",
    ):
        assert forbidden not in joined, f"{forbidden} contaminaria o launch do login"


# --- deteccao de processo segurando o perfil -----------------------------------


def test_command_line_com_path_entre_aspas_e_reconhecido():
    cmd = 'chrome.exe --type=renderer --user-data-dir="C:\\Users\\eu\\.shopee_profile" --x'
    assert _command_line_targets_profile(cmd, "c:/users/eu/.shopee_profile")


def test_command_line_sem_aspas_e_reconhecido():
    cmd = "chrome.exe --user-data-dir=C:/projeto/.shopee_profile --first-run"
    assert _command_line_targets_profile(cmd, "c:/projeto/.shopee_profile")


def test_command_line_de_outro_perfil_nao_confunde():
    cmd = "chrome.exe --user-data-dir=C:/outro/perfil --first-run"
    assert not _command_line_targets_profile(cmd, "c:/projeto/.shopee_profile")


def test_prefixo_similar_nao_confunde(tmp_path):
    """`C:\\proj\\.shopee_profile` e `C:\\proj\\.shopee_profile_backup` sao perfis
    diferentes; comparar por substring aceitaria um e derrubaria o outro."""
    cmd = "chrome.exe --user-data-dir=C:/proj/.shopee_profile_backup"
    assert not _command_line_targets_profile(cmd, "c:/proj/.shopee_profile")


def test_normalize_dir_tira_barra_final_e_caixa():
    assert _normalize_dir("C:\\Proj\\.Shopee_Profile\\") == "c:/proj/.shopee_profile"


# --- is_cookie_live -------------------------------------------------------------


def test_cookie_de_sessao_nao_expira():
    assert is_cookie_live(0, now_utc_us=1)


def test_cookie_expirado_nao_conta_como_login():
    assert not is_cookie_live(1000, now_utc_us=5000)


def test_cookie_vivo_conta_como_login():
    assert is_cookie_live(9000, now_utc_us=5000)


# --- read_auth_state ------------------------------------------------------------


def test_perfil_com_spc_st_esta_autenticado(tmp_path):
    _make_cookie_db(tmp_path, [(".shopee.com.br", SHOPEE_AUTH_COOKIE, 0)])
    assert read_auth_state(tmp_path, now_utc_us=1_000) is True


def test_perfil_so_com_cookies_anti_bot_esta_deslogado(tmp_path):
    """Era este o estado do `.shopee_profile` no diagn├│stico: SPC_SI/SPC_SEC_SI e
    cia presentes, nenhum SPC_ST ÔÇö a Shopee exige login mas a varredura passa."""
    _make_cookie_db(
        tmp_path,
        [
            (".shopee.com.br", "SPC_SI", 0),
            (".shopee.com.br", "SPC_SEC_SI", 0),
            (".shopee.com.br", "SPC_R_T_ID", 0),
        ],
    )
    assert read_auth_state(tmp_path, now_utc_us=1_000) is False


def test_spc_st_vencido_nao_conta_como_login(tmp_path):
    _make_cookie_db(tmp_path, [(".shopee.com.br", SHOPEE_AUTH_COOKIE, 1_000)])
    assert read_auth_state(tmp_path, now_utc_us=99_000) is False


def test_spc_st_de_outro_dominio_nao_vale(tmp_path):
    _make_cookie_db(tmp_path, [(".exemplo.com.br", SHOPEE_AUTH_COOKIE, 0)])
    assert read_auth_state(tmp_path, now_utc_us=1_000) is False


def test_perfil_sem_banco_de_cookies_esta_deslogado(tmp_path):
    assert read_auth_state(tmp_path, now_utc_us=1_000) is False


def test_leitura_travada_devolve_none_e_nao_false(tmp_path, monkeypatch):
    """Com o Chrome aberto o arquivo de cookies est├í em lock exclusivo e a c├│pia
    falha. Devolver `False` aqui seria inventar um "deslogado" que n├úo existe ÔÇö
    ├® o terceiro estado que a UI precisa saber tratar."""
    profile = tmp_path
    _make_cookie_db(profile, [(".shopee.com.br", SHOPEE_AUTH_COOKIE, 0)])

    def locked_read(_self: Path):
        raise PermissionError(32, "The process cannot access the file")

    monkeypatch.setattr(Path, "read_bytes", locked_read)
    assert read_auth_state(profile, now_utc_us=1_000) is None


def test_banco_legado_default_cookies_tambem_e_lido(tmp_path):
    """Chrome antigo gravava em `Default/Cookies`; o perfil pode ter vindo de l├í."""
    legacy_dir = tmp_path / "Default"
    legacy_dir.mkdir(parents=True)
    conn = sqlite3.connect(legacy_dir / "Cookies")
    try:
        conn.execute("CREATE TABLE cookies (host_key TEXT, name TEXT, expires_utc INTEGER)")
        conn.execute("INSERT INTO cookies VALUES (?, ?, ?)", (".shopee.com.br", SHOPEE_AUTH_COOKIE, 0))
        conn.commit()
    finally:
        conn.close()

    assert read_auth_state(tmp_path, now_utc_us=1_000) is True


# --- artefatos de lock ----------------------------------------------------------


def test_lock_artifacts_cobre_o_que_o_chrome_real_deixa():
    """O driver antigo procurava s├│ `lockfile`, que o Chrome no Windows nunca cria
    -- por isso a mensagem de "perfil em uso" nunca aparecia."""
    assert "lockfile" in LOCK_ARTIFACTS
    assert "SingletonLock" in LOCK_ARTIFACTS
